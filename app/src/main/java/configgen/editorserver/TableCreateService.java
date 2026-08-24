package configgen.editorserver;

import com.alibaba.fastjson2.JSONArray;
import com.alibaba.fastjson2.JSONObject;
import configgen.schema.*;
import configgen.schema.cfg.CfgReader;
import configgen.schema.cfg.CfgSyntaxException;
import configgen.schema.cfg.CfgWriter;
import configgen.tool.SchemaToCsvHeader;
import configgen.util.CSVUtil;
import configgen.util.CachedFiles;
import configgen.util.Logger;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

/**
 * 建表服务：接收 JSON 描述的表/结构体/枚举定义，合并到现有 CfgSchema 后写回 config.cfg，
 * 并可选地为 table 类型创建空 CSV 数据文件（仅含表头行）。
 */
public class TableCreateService {

    public record CreateResult(boolean ok, List<String> errors) {
    }

    private static final String IDENTIFIER_PATTERN = "[a-zA-Z_][a-zA-Z0-9_]*";

    /**
     * 创建新表/结构体/枚举并写回 config.cfg。
     *
     * @param dataDir      数据目录（config.cfg 所在目录）
     * @param existingText 当前 config.cfg 文本（用于增量合并）
     * @param request      JSON 请求体，格式：
     *                     { "type": "table"|"struct"|"enum", "name": "mytable",
     *                       "fields": [{ "name": "id", "type": "int", "comment": "..." }],
     *                       "primaryKey": ["id"], "withDataFile": true,
     *                       "enumValues": [{ "name": "A", "comment": "..." }] }
     */
    public static CreateResult createTable(Path dataDir, String existingText, JSONObject request) {
        List<String> errors = new ArrayList<>();

        // 1. 解析现有 config.cfg
        CfgSchema schema;
        try {
            if (existingText != null && !existingText.isBlank()) {
                schema = CfgReader.parse(existingText);
            } else {
                schema = CfgSchema.of();
            }
        } catch (CfgSyntaxException e) {
            errors.add("Failed to parse existing config.cfg: " + e.getMessage());
            return new CreateResult(false, errors);
        } catch (Exception e) {
            errors.add("Failed to parse existing config.cfg: " + e.getMessage());
            return new CreateResult(false, errors);
        }

        // 2. 根据 type 构建新元素
        String type = request.getString("type");
        String name = request.getString("name");

        if (name == null || name.isBlank()) {
            errors.add("Name is required");
            return new CreateResult(false, errors);
        }
        if (!name.matches(IDENTIFIER_PATTERN)) {
            errors.add("Name must be a valid identifier: " + name);
            return new CreateResult(false, errors);
        }

        // 检查名字是否与现有元素冲突
        for (Nameable item : schema.items()) {
            if (item.name().equalsIgnoreCase(name)) {
                errors.add("Name already exists: " + name);
                return new CreateResult(false, errors);
            }
        }

        try {
            Nameable newElement = switch (type) {
                case "table" -> buildTableSchema(request, name);
                case "struct" -> buildStructSchema(request, name);
                case "enum" -> buildEnumTableSchema(request, name);
                default -> {
                    errors.add("Unknown type: " + type + ", must be 'table', 'struct', or 'enum'");
                    yield null;
                }
            };

            if (newElement == null) {
                return new CreateResult(false, errors);
            }

            schema.add(newElement);

            // 3. 校验合并后的 schema
            CfgSchemaErrs errs = schema.resolve();
            try {
                errs.checkErrors("createTable");
            } catch (CfgSchemaException e) {
                for (CfgSchemaErrs.Err err : e.getErrs().errs()) {
                    errors.add(err.msg());
                }
                return new CreateResult(false, errors);
            }

            // 4. 可选：先创建空数据文件（失败则中止，避免 config.cfg 已写入但 CSV 缺失的半成品）
            if ("table".equals(type) && request.getBooleanValue("withDataFile", false)) {
                TableSchema table = (TableSchema) newElement;
                if (!table.meta().hasEnumValues()) {
                    createEmptyCsv(dataDir, table);
                }
            }

            // 5. 写回 config.cfg
            String cfgText = CfgWriter.stringify(schema);
            Path cfgPath = dataDir.resolve("config.cfg");
            CachedFiles.writeFile(cfgPath, cfgText.getBytes(StandardCharsets.UTF_8));
            Logger.log("Table created and config.cfg written: " + name);

            return new CreateResult(true, List.of());

        } catch (CfgSchemaException e) {
            for (CfgSchemaErrs.Err err : e.getErrs().errs()) {
                errors.add(err.msg());
            }
            return new CreateResult(false, errors);
        } catch (Exception e) {
            errors.add(e.getMessage());
            return new CreateResult(false, errors);
        }
    }

    /**
     * 为已有表创建空数据文件（CSV 仅含表头）。
     *
     * @param dataDir  数据目录
     * @param tableName 表名
     */
    public static CreateResult createDataFile(Path dataDir, String tableName) {
        List<String> errors = new ArrayList<>();

        // 读取并解析现有 schema
        Path cfgPath = dataDir.resolve("config.cfg");
        String cfgText;
        try {
            cfgText = Files.readString(cfgPath, StandardCharsets.UTF_8);
        } catch (IOException e) {
            errors.add("Failed to read config.cfg: " + e.getMessage());
            return new CreateResult(false, errors);
        }

        CfgSchema schema;
        try {
            schema = CfgReader.parse(cfgText);
            schema.resolve().checkErrors("createDataFile");
        } catch (Exception e) {
            errors.add("Failed to parse/resolve schema: " + e.getMessage());
            return new CreateResult(false, errors);
        }

        // 找到目标表
        TableSchema targetTable = null;
        for (Nameable item : schema.items()) {
            if (item instanceof TableSchema ts && ts.name().equals(tableName)) {
                targetTable = ts;
                break;
            }
        }

        if (targetTable == null) {
            errors.add("Table not found: " + tableName);
            return new CreateResult(false, errors);
        }

        if (targetTable.isJson()) {
            errors.add("Table uses JSON data source, cannot create CSV file: " + tableName);
            return new CreateResult(false, errors);
        }

        if (targetTable.meta().hasEnumValues()) {
            errors.add("Enum table does not need a data file: " + tableName);
            return new CreateResult(false, errors);
        }

        // 检查文件是否已存在
        Path csvPath = dataDir.resolve(tableName + ".csv");
        if (Files.exists(csvPath)) {
            errors.add("Data file already exists: " + csvPath.getFileName());
            return new CreateResult(false, errors);
        }

        try {
            createEmptyCsv(dataDir, targetTable);
            Logger.log("Data file created: " + csvPath);
            return new CreateResult(true, List.of());
        } catch (IOException e) {
            errors.add("Failed to create data file: " + e.getMessage());
            return new CreateResult(false, errors);
        }
    }

    // ---- 内部方法 ----

    private static TableSchema buildTableSchema(JSONObject request, String name) {
        // table 名必须全小写
        if (!name.equals(name.toLowerCase())) {
            CfgSchemaErrs errs = CfgSchemaErrs.of();
            errs.addErr(new CfgSchemaErrs.TableNameNotLowerCase(name));
            throw new CfgSchemaException(errs);
        }

        JSONArray fieldsArr = request.getJSONArray("fields");
        if (fieldsArr == null || fieldsArr.isEmpty()) {
            throw new IllegalArgumentException("Table must have at least one field");
        }

        List<FieldSchema> fields = new ArrayList<>();
        for (int i = 0; i < fieldsArr.size(); i++) {
            JSONObject f = fieldsArr.getJSONObject(i);
            fields.add(buildFieldSchema(f));
        }

        // 主键
        JSONArray pkArr = request.getJSONArray("primaryKey");
        KeySchema primaryKey;
        if (pkArr != null && !pkArr.isEmpty()) {
            List<String> pkFields = new ArrayList<>();
            for (int i = 0; i < pkArr.size(); i++) {
                pkFields.add(pkArr.getString(i));
            }
            primaryKey = new KeySchema(pkFields);
        } else {
            primaryKey = new KeySchema(List.of(fields.get(0).name()));
        }

        return new TableSchema(
                name.toLowerCase(),
                primaryKey,
                EntryType.ENo.NO,
                false,
                Metadata.of(),
                fields,
                List.of(),
                List.of()
        );
    }

    private static StructSchema buildStructSchema(JSONObject request, String name) {
        JSONArray fieldsArr = request.getJSONArray("fields");
        if (fieldsArr == null || fieldsArr.isEmpty()) {
            throw new IllegalArgumentException("Struct must have at least one field");
        }

        List<FieldSchema> fields = new ArrayList<>();
        for (int i = 0; i < fieldsArr.size(); i++) {
            JSONObject f = fieldsArr.getJSONObject(i);
            fields.add(buildFieldSchema(f));
        }

        return new StructSchema(
                name,
                FieldFormat.AutoOrPack.AUTO,
                Metadata.of(),
                fields,
                List.of()
        );
    }

    private static TableSchema buildEnumTableSchema(JSONObject request, String name) {
        // enum 是一种 TableSchema，通过 Metadata 标记
        if (!name.equals(name.toLowerCase())) {
            CfgSchemaErrs errs = CfgSchemaErrs.of();
            errs.addErr(new CfgSchemaErrs.TableNameNotLowerCase(name));
            throw new CfgSchemaException(errs);
        }

        JSONArray enumValuesArr = request.getJSONArray("enumValues");
        if (enumValuesArr == null || enumValuesArr.isEmpty()) {
            throw new IllegalArgumentException("Enum must have at least one value");
        }

        List<Metadata.EnumValueAssigned> values = new ArrayList<>();
        for (int i = 0; i < enumValuesArr.size(); i++) {
            JSONObject v = enumValuesArr.getJSONObject(i);
            String vName = v.getString("name");
            String vComment = v.getString("comment", "");
            values.add(new Metadata.EnumValueAssigned(vName, vComment, i));
        }

        Metadata meta = Metadata.of();
        meta.putEnumValues(new Metadata.MetaEnumValues.OfAssigned(values));

        // enum 的字段就是 name 列
        FieldSchema nameField = new FieldSchema("name", FieldType.Primitive.STRING,
                FieldFormat.AutoOrPack.AUTO, Metadata.of());

        return new TableSchema(
                name.toLowerCase(),
                new KeySchema(List.of("name")),
                new EntryType.EEnum("name"),
                false,
                meta,
                List.of(nameField),
                List.of(),
                List.of()
        );
    }

    private static FieldSchema buildFieldSchema(JSONObject f) {
        String fieldName = f.getString("name");
        if (fieldName == null || fieldName.isBlank()) {
            throw new IllegalArgumentException("Field name is required");
        }
        if (!fieldName.matches(IDENTIFIER_PATTERN)) {
            throw new IllegalArgumentException("Invalid field name: " + fieldName);
        }

        String fieldType = f.getString("type");
        if (fieldType == null) {
            fieldType = "int";
        }

        FieldType ft = parseFieldType(fieldType);
        Metadata meta = Metadata.of();

        String comment = f.getString("comment");
        if (comment != null && !comment.isBlank()) {
            meta.putComment(new CommentData("", comment, null));
        }

        return new FieldSchema(fieldName, ft, FieldFormat.AutoOrPack.AUTO, meta);
    }

    private static FieldType parseFieldType(String type) {
        return switch (type.toLowerCase()) {
            case "bool" -> FieldType.Primitive.BOOL;
            case "int" -> FieldType.Primitive.INT;
            case "long" -> FieldType.Primitive.LONG;
            case "float" -> FieldType.Primitive.FLOAT;
            case "string" -> FieldType.Primitive.STRING;
            case "text" -> FieldType.Primitive.TEXT;
            default -> new FieldType.StructRef(type);
        };
    }

    private static void createEmptyCsv(Path dataDir, TableSchema table) throws IOException {
        SchemaToCsvHeader headerGen = new SchemaToCsvHeader();
        headerGen.flattenFields(table.fields());

        List<List<String>> rows = List.of(
                headerGen.getCommentRow(),
                headerGen.getNameRow()
        );

        Path csvPath = dataDir.resolve(table.name() + ".csv");
        CSVUtil.writeToFile(csvPath.toFile(), rows);
    }
}

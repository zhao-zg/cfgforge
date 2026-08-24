package configgen.editorserver;

import configgen.schema.CfgSchema;
import configgen.schema.CfgSchemaErrs;
import configgen.schema.CfgSchemaException;
import configgen.schema.CfgSchemas;
import configgen.schema.cfg.CfgReader;
import configgen.schema.cfg.CfgSyntaxException;
import configgen.util.CachedFiles;
import configgen.util.Logger;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

/**
 * Schema 文本读写服务：支持获取当前 CFG 文本和写回编辑后的文本。
 */
public class SchemaWriteService {

    public record SchemaText(String text) {
    }

    public record SchemaWriteResult(boolean ok, List<String> errors) {
    }

    /**
     * 读取数据目录下所有 .cfg 文件文本并拼接返回。
     * 根目录的 config.cfg 在最前，各模块 cfg 按包名排序追加。
     */
    public static SchemaText readSchemaText(Path dataDir, List<configgen.schema.CfgFileInfo> cfgFiles) {
        StringBuilder sb = new StringBuilder();
        for (configgen.schema.CfgFileInfo c : cfgFiles) {
            try {
                String content = Files.readString(c.path(), StandardCharsets.UTF_8);
                if (!content.isEmpty()) {
                    if (!sb.isEmpty() && !content.startsWith("\n")) {
                        sb.append("\n");
                    }
                    sb.append(content);
                }
            } catch (IOException e) {
                Logger.log("Failed to read cfg file: " + c.path() + " - " + e.getMessage());
            }
        }
        return new SchemaText(sb.toString());
    }

    /**
     * 解析 CFG 文本，校验语法和 schema 语义，通过后写回根目录的 config.cfg。
     * 多模块场景下，全部内容写入根目录 config.cfg（简化处理，后续可按模块拆分）。
     *
     * @return 写入成功返回 ok=true，失败返回 ok=false + 错误信息列表
     */
    public static SchemaWriteResult writeSchemaText(Path dataDir, String cfgText) {
        List<String> errors = new ArrayList<>();

        // 1. 解析 CFG 文本（语法校验）
        CfgSchema schema;
        try {
            schema = CfgReader.parse(cfgText);
        } catch (CfgSyntaxException e) {
            errors.add(e.getMessage());
            return new SchemaWriteResult(false, errors);
        } catch (Exception e) {
            errors.add(e.getMessage());
            return new SchemaWriteResult(false, errors);
        }

        // 2. Schema 语义校验（resolve 阶段会检查重名、类型引用等）
        try {
            CfgSchemaErrs errs = schema.resolve();
            errs.checkErrors("schemaWrite");
        } catch (CfgSchemaException e) {
            for (CfgSchemaErrs.Err err : e.getErrs().errs()) {
                errors.add(err.msg());
            }
            return new SchemaWriteResult(false, errors);
        } catch (Exception e) {
            errors.add(e.getMessage());
            return new SchemaWriteResult(false, errors);
        }

        // 3. 写回 config.cfg 文件
        Path cfgPath = dataDir.resolve("config.cfg");
        try {
            CachedFiles.writeFile(cfgPath, cfgText.getBytes(StandardCharsets.UTF_8));
            Logger.log("Schema text written to " + cfgPath);
        } catch (IOException e) {
            errors.add("Failed to write config.cfg: " + e.getMessage());
            return new SchemaWriteResult(false, errors);
        }

        return new SchemaWriteResult(true, List.of());
    }
}

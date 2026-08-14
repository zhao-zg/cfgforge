package configgen.data;

import java.util.Collection;

/// value层解析json数据表时需要的端口：按表名取该表的json文件清单。
/// 由ctx.DirectoryStructure实现，value层不依赖ctx。
public interface JsonTableFiles {
    Collection<JsonFileInfo> jsonFilesOf(String tableName);
}

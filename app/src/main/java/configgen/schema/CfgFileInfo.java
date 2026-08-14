package configgen.schema;

import java.nio.file.Path;

public record CfgFileInfo(long lastModified,
                          Path path,
                          Path relativePath,
                          String pkgNameDot) {
}

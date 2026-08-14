package configgen.util;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;

public class CachedFiles {
    // 表生成并发：writeFile/keepFile 会被多个工作线程同时调用，必须用并发安全 Set
    private static final Set<String> filename_set = ConcurrentHashMap.newKeySet();

    // Main.run末尾的finalExit会迭代这两个列表，而watch的bat虚拟线程可能同时在跑
    // generator注册清理目录，必须用并发安全容器
    private static final List<File> deleteFiles = new CopyOnWriteArrayList<>();
    private static final List<File> deleteKeepMetaWithSuffixFiles = new CopyOnWriteArrayList<>();
    private static final Set<String> metaSuffixSet = Set.of(".meta", ".uid");

    public static void deleteOtherFiles(File dir) {
        deleteFiles.add(dir);
    }

    public static void keepMetaAndDeleteOtherFiles(File dir) {
        deleteKeepMetaWithSuffixFiles.add(dir);
    }

    // Main.run每次运行末尾都会调用（不只进程退出），登记必须按run清空：
    // 否则GUI第二次Run会按上一轮的登记再清一遍目录，上一轮之后新生成的文件会被误删。
    // 清空安全：所有要keep的文件每run都会重新登记（writeFile/copyFileIfNotExist都无条件keepFile）
    public static void finalExit() {
        deleteFiles.stream().filter(File::exists)
                .forEach(f -> doRemoveFile(f, false));
        deleteKeepMetaWithSuffixFiles.forEach(dir ->
                doRemoveFile(dir, true));
        deleteFiles.clear();
        deleteKeepMetaWithSuffixFiles.clear();
        filename_set.clear();
    }

    public static void writeFile(Path path, byte[] data) throws IOException {
        keepFile(path);
        if (!path.toFile().exists()) {
            Logger.log("create file: " + path);
            mkdirs(path.getParent().toFile());
            Files.write(path, data, StandardOpenOption.CREATE,
                    StandardOpenOption.WRITE, StandardOpenOption.TRUNCATE_EXISTING);
            return;
        }

        // 大小不同则内容必然变化，直接写入，避免读取整个旧文件做逐字节比较
        if (path.toFile().length() != data.length) {
            Logger.log("modify file: " + path);
            Files.write(path, data, StandardOpenOption.CREATE,
                    StandardOpenOption.WRITE, StandardOpenOption.TRUNCATE_EXISTING);
            return;
        }

        byte[] buf = Files.readAllBytes(path);
        if (!Arrays.equals(buf, data)) {
            Logger.log("modify file: " + path);
            Files.write(path, data, StandardOpenOption.CREATE,
                    StandardOpenOption.WRITE, StandardOpenOption.TRUNCATE_EXISTING);
        }
    }

    public static void keepFile(Path path) {
        filename_set.add(fileKey(path));
    }

    private static void mkdirs(File file) {
        if (!file.exists()) {
            if (!file.mkdirs()) {
                Logger.log("mkdirs fail: " + normalizePath(file.toPath()));
            }
        }
    }

    private static String fileKey(Path path) {
        return path.toAbsolutePath().normalize().toString().toLowerCase();
    }

    private static String normalizePath(Path path) {
        return path.toAbsolutePath().normalize().toString();
    }

    public static boolean delete(File file) {
        String dir = file.isDirectory() ? "dir" : "file";
        boolean deleteOk = file.delete();
        String status = deleteOk ? "" : " fail";
        Logger.log("delete " + dir + status + ": " + normalizePath(file.toPath()));
        return deleteOk;
    }

    private static void doRemoveFile(File file, boolean keepMeta) {
        String key = fileKey(file.toPath());
        boolean keep = filename_set.contains(key);
        if (keep) {
            return;
        }

        if (keepMeta) {
            String noMetaKey = findNoMetaKey(key);
            if (noMetaKey != null) {
                keep = filename_set.contains(noMetaKey);
                if (!keep && new File(noMetaKey).isDirectory()) {
                    for (String f : filename_set) {
                        if (f.startsWith(noMetaKey)) {
                            keep = true;
                            break;
                        }
                    }
                }
            }
        }

        if (keep) {
            return;
        }

        if (file.isDirectory()) {
            File[] files = file.listFiles();
            if (files != null) {
                for (File f : files) {
                    doRemoveFile(f, keepMeta);
                }
            }
            File[] newFiles = file.listFiles();
            if (newFiles != null && newFiles.length == 0) {
                delete(file);
            }
        } else {
            delete(file);
        }
    }

    private static String findNoMetaKey(String key) {
        for (String metaSuffix : metaSuffixSet) {
            if (key.endsWith(metaSuffix)) {
                return key.substring(0, key.length() - metaSuffix.length());
            }
        }
        return null;
    }


}

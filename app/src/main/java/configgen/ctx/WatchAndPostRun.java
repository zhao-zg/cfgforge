package configgen.ctx;

import configgen.gen.Generator;
import configgen.gen.Generators;
import configgen.util.LocaleUtil;
import configgen.util.Logger;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.TimeUnit;

public enum WatchAndPostRun {
    INSTANCE;

    public interface PostRunCallback {
        void onNewContextLoaded(Context newContext);
    }

    private static class PostRunBat {
        String batFile; // .bat 或 .sh 文件
        volatile Thread thread = null; // 执行该bat文件的线程

        PostRunBat(String batFile) {
            this.batFile = batFile;
        }
    }

    private boolean started = false;
    // 注册发生在主线程、迭代发生在reload线程/bat虚拟线程，用COW保证可见性
    private final List<PostRunBat> postRunBats = new CopyOnWriteArrayList<>();
    private final List<PostRunCallback> postRunCallbacks = new CopyOnWriteArrayList<>();
    // reloadData（WaitWatcher 线程）写、tryPostRun 的 bat 虚拟线程（:163）读，跨线程必须保证可见性
    private volatile Context context;
    private Watcher watcher;
    private WaitWatcher waitWatcher;
    // autoFix写回config.cfg会再触发watch→reload，若对齐不稳定会形成写-触发循环，需要上限保护
    private int consecutiveAutoFixReloads = 0;
    private static final int MAX_CONSECUTIVE_AUTO_FIX_RELOADS = 3;
    // bat里先跑-generator再跑外部进程，外部进程不关stdout时readLine会永久阻塞，join必须有界
    private static final long POST_RUN_JOIN_TIMEOUT_MILLIS = 10 * 60 * 1000;

    /**
     * 开始监听，多次调用，只有第一次起效，后面的忽略
     * @param context 上下文
     * @param waitSecondsAfterWatchEvt  监听到文件变化后，等待多少秒再执行reloadData，避免频繁触发
     */
    public synchronized void startWatch(Context context, int waitSecondsAfterWatchEvt) {
        if (started) {
            if (this.context == context) {
                // 正常场景：同一命令行下多个generator（如 server + mcpserver）共享同一个context和watcher
                Logger.log(LocaleUtil.getLocaleString("WatchAndPostRun.WatcherAlreadyStarted",
                    "file change watcher already started, shared"));
            } else {
                Logger.log(LocaleUtil.getLocaleString("WatchAndPostRun.WatcherAlreadyStartedByOtherContext",
                    "file change watcher already started by ANOTHER context, this startWatch is IGNORED!"));
            }
            return;
        }
        if (waitSecondsAfterWatchEvt < 0) {
            Logger.log(LocaleUtil.getLocaleString("WatchAndPostRun.WatcherWaitSecondsInvalid",
                "watcher waitSecondsAfterWatchEvt < 0, ignore start"));
            return;
        }
        this.context = context;
        started = true;
        consecutiveAutoFixReloads = 0;

        DirectoryStructure ss = context.sourceStructure();
        watcher = new Watcher(ss.getRootDir(), ss.getExplicitDir());
        waitWatcher = new WaitWatcher(watcher, this::reloadData, waitSecondsAfterWatchEvt * 1000);
        waitWatcher.start();
        watcher.start();

        Logger.log(LocaleUtil.getLocaleString("WatchAndPostRun.WatcherStarted",
            "file change watcher started"));
    }

    private synchronized void stopWatch() {
        if (waitWatcher != null) {
            waitWatcher.stop();
            waitWatcher = null;
        }
        if (watcher != null) {
            watcher.stop();
            watcher = null;
        }
        started = false;
    }

    /**
     * 要在主线程中做注册
     * @param batchFile .bat 或 .sh 文件
     */
    public void registerPostRunBat(String batchFile) {
        if (batchFile == null) {
            return;
        }

        for (PostRunBat ob : postRunBats) {
            if (ob.batFile.equals(batchFile)) {
                Logger.log(LocaleUtil.getFormatedLocaleString("WatchAndPostRun.BatchFileAlreadyRegistered",
                    "batch file {0} already registered for post run", batchFile));
                return;
            }
        }
        postRunBats.add(new PostRunBat(batchFile));
    }

    /**
     * 要在主线程中做注册
     * @param callback 回调函数
     */
    public void registerPostRunCallback(PostRunCallback callback) {
        if (callback == null) {
            return;
        }
        postRunCallbacks.add(callback);
    }

    /**
     * 这是在virtual thread里执行的
     */
    private void reloadData() {
        Context cur = context;
        DirectoryStructure newStructure = cur.sourceStructure().reload();
        if (newStructure.lastModifiedEquals(cur.sourceStructure())) {
            Logger.verbose(LocaleUtil.getLocaleString("WatchAndPostRun.LastModifiedNotChanged",
                "lastModified not change"));
            return;
        }
        try {
            Context newContext = new Context(cur.contextCfg(), newStructure);
            if (newContext.lastLoadDidAutoFix()) {
                consecutiveAutoFixReloads++;
                if (consecutiveAutoFixReloads >= MAX_CONSECUTIVE_AUTO_FIX_RELOADS) {
                    Logger.log(LocaleUtil.getFormatedLocaleString("WatchAndPostRun.AutoFixLoopDetected",
                        "reload触发autoFix写回config.cfg已连续{0}次，疑似对齐不稳定导致写-触发循环，停止watch（保留当前内存状态）",
                        consecutiveAutoFixReloads));
                    stopWatch();
                    return;
                }
            } else {
                consecutiveAutoFixReloads = 0;
            }
            this.context = newContext;
            Logger.log(LocaleUtil.getLocaleString("WatchAndPostRun.ReloadContextOk",
                "reload context ok"));
            onNewContextReloaded();
        } catch (Exception e) {
            Logger.log(LocaleUtil.getFormatedLocaleString("WatchAndPostRun.ReloadContextIgnored",
                "reload context ignored: {0}", e.toString()));
            if (Logger.verboseLevel() > 0) {
                e.printStackTrace();
            }
        }

    }

    private void onNewContextReloaded() {
        for (PostRunCallback callback : postRunCallbacks) {
            try {
                callback.onNewContextLoaded(context);
            } catch (Exception e) {
                Logger.log(LocaleUtil.getFormatedLocaleString("WatchAndPostRun.FailedToRunPostRun",
                    "failed to run post run task: {0}", e.getMessage()));
            }
        }

        for (PostRunBat bat : postRunBats) {
            tryPostRun(bat);
        }

    }


    private void tryPostRun(PostRunBat bat) {
        Thread batThread = bat.thread;
        if (batThread != null) {
            try {
                batThread.join(POST_RUN_JOIN_TIMEOUT_MILLIS);
            } catch (InterruptedException e) {
                Logger.log(LocaleUtil.getFormatedLocaleString("WatchAndPostRun.PostRunThreadJoinInterrupted",
                    "post run thread join interrupted: {0}", e.getMessage()));
            }
            if (batThread.isAlive()) {
                // 上一个post run卡住（如外部进程不关stdout导致readLine永久阻塞），
                // 跳过本次触发，不能让reload管道跟着永久停摆
                Logger.log(LocaleUtil.getFormatedLocaleString("WatchAndPostRun.PostRunStillRunning",
                    "previous post run still running after {0}ms, skip this trigger: {1}",
                    POST_RUN_JOIN_TIMEOUT_MILLIS, bat.batFile));
                return;
            }
        }

        String postRun = bat.batFile;
        bat.thread = Thread.startVirtualThread(() -> {
            try {
                String genPrefix = null;
                if (postRun.endsWith(".bat")) {
                    genPrefix = ":: -gen ";
                } else if (postRun.endsWith(".sh")) {
                    genPrefix = "# -gen ";
                }
                if (genPrefix != null) {
                    for (String line : Files.readAllLines(Path.of(postRun))) {
                        if (line.startsWith(genPrefix)) {
                            String parameter = line.substring(genPrefix.length());
                            Generator generator = Generators.create(parameter);
                            if (generator != null) {
                                Logger.log("-gen " + parameter);
                                generator.generate(context);
                            }
                        } else {
                            break;
                        }
                    }
                }

                Process process = new ProcessBuilder(postRun).redirectErrorStream(true).start();
                try (BufferedReader in = new BufferedReader(new InputStreamReader(process.getInputStream()))) {
                    String line;
                    while ((line = in.readLine()) != null) {
                        Logger.log(LocaleUtil.getFormatedLocaleString("WatchAndPostRun.PostRunOutput",
                            "post run output: {0}", line));
                    }
                    if (process.waitFor(10, TimeUnit.SECONDS)) {
                        Logger.log(LocaleUtil.getLocaleString("WatchAndPostRun.PostRunOk",
                            "post run ok!"));
                    } else {
                        Logger.log(LocaleUtil.getLocaleString("WatchAndPostRun.PostRunTimeout",
                            "post run timeout"));
                        process.destroy();
                        if (!process.waitFor(5, TimeUnit.SECONDS)) {
                            process.destroyForcibly();
                        }
                    }
                }
            } catch (IOException e) {
                Logger.log(LocaleUtil.getFormatedLocaleString("WatchAndPostRun.PostRunErr",
                    "post run err: {0}", e.getMessage()));
            } catch (InterruptedException e) {
                Logger.log(LocaleUtil.getFormatedLocaleString("WatchAndPostRun.PostRunInterrupted",
                    "post run interrupted: {0}", e.getMessage()));
            }
        });
    }
}


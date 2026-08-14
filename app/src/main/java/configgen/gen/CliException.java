package configgen.gen;

/**
 * 命令行使用错误（缺参数取值、参数组合非法等）。
 * runWithCatch 捕获后打印简短原因和usage，不打印堆栈。
 */
public class CliException extends RuntimeException {
    public CliException(String message) {
        super(message);
    }
}

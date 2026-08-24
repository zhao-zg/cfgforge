/**
 * 国际化工具。简化版：不做 ResourceBundle 加载，直接返回 defaultMsg。
 * 原 Java: configgen.util.LocaleUtil
 *
 * Java 版用 ResourceBundle 从 messages_xx.properties 加载翻译文本，
 * TS 版可以用 JSON 文件替代。当前先实现 fallback 逻辑。
 */

export interface LocaleMessages {
  [key: string]: string;
}

class LocaleUtilImpl {
  private messages: LocaleMessages = {};
  private currentLocale: string = 'en';

  setMessages(msgs: LocaleMessages): void {
    this.messages = msgs;
  }

  setLocale(locale: string): void {
    this.currentLocale = locale;
    this.messages = {};
  }

  getLocale(): string {
    return this.currentLocale;
  }

  findLocaleString(key: string): string | null {
    return this.messages[key] ?? null;
  }

  getLocaleString(key: string, defaultMsg: string): string {
    return this.findLocaleString(key) ?? defaultMsg;
  }

  /**
   * 简单模板替换：{0}, {1} -> args[0], args[1]
   */
  getFormatedLocaleString(key: string, defaultMsg: string, ...args: any[]): string {
    let template = this.getLocaleString(key, defaultMsg);
    if (args.length > 0) {
      for (let i = 0; i < args.length; i++) {
        template = template.replace(new RegExp(`\\{${i}\\}`, 'g'), String(args[i]));
      }
    }
    return template;
  }
}

export const LocaleUtil = new LocaleUtilImpl();

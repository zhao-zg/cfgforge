/**
 * SingleTableReloadService — P1-5 单表数据重载。
 *
 * 通过 DataUpdater.updateByReloadTable 重新读取指定表的源文件（CSV/Excel），
 * 得到合并了新表数据的新 CfgData；随后把新 CfgData 写回 editor 的 context
 * （Context.updateDataAndValue），并用新 CfgData 重建 CfgValue 快照
 * （CfgValueParser → EditorService.adoptNewCfgValue）。
 *
 * 与 editor.reload()（全量重建 Context）相比，本服务只重载一张表的数据，
 * 不重读 schema、不影响其他表。
 *
 * 依赖：editor-core → context（DataUpdater/Context）/ value（CfgValueParser）。
 */

import { DataUpdater } from '@cfgforge/context';
import type { CfgData } from '@cfgforge/data';
import { ValueEnv, CfgValueParser, CfgValueErrs } from '@cfgforge/value';
import type { EditorService } from './EditorService.js';

export interface SingleTableReloadResult {
  ok: boolean;
  errors: string[];
}

export class SingleTableReloadService {
  /**
   * 重载单表数据。表不存在 → { ok: false, errors }。
   * 成功后 editor 的 CfgValue 快照已刷新（调用方无需再 reload）。
   */
  static async reloadTable(editor: EditorService, tableName: string): Promise<SingleTableReloadResult> {
    const context = editor.context();
    const dTable = context.cfgData().tables.get(tableName);
    if (dTable === undefined) {
      return { ok: false, errors: [`Table not found: ${tableName}`] };
    }

    let updater: DataUpdater;
    try {
      updater = await DataUpdater.updateByReloadTable(context, dTable);
    } catch (e) {
      return { ok: false, errors: [(e as Error).message] };
    }
    if (updater.errStrList.length > 0) {
      return { ok: false, errors: updater.errStrList };
    }

    const newCfgData: CfgData = updater.newCfgData;
    try {
      const newCfgValue = await SingleTableReloadService.rebuildValue(editor, newCfgData);
      context.updateDataAndValue(newCfgData, newCfgValue);
      editor.adoptNewCfgValue(newCfgValue);
      return { ok: true, errors: [] };
    } catch (e) {
      return { ok: false, errors: [(e as Error).message] };
    }
  }

  /** 用新 CfgData 重建 CfgValue（与 EditorService.initFromContext 相同的 allowErr=true 语义）。 */
  private static async rebuildValue(editor: EditorService, cfgData: CfgData): Promise<import('@cfgforge/value').CfgValue> {
    const context = editor.context();
    const valueErrs = CfgValueErrs.of();
    const env = new ValueEnv(
      context.cfgSchema(),
      cfgData,
      context.contextCfg().headRow,
      context.nullableLangTextFinder() as unknown as null,
      context.sourceStructure(),
    );
    const parser = new CfgValueParser(context.cfgSchema(), env, valueErrs);
    const cfgValue = await parser.parseCfgValueAsync();
    valueErrs.checkErrors('value', true);
    return cfgValue;
  }
}
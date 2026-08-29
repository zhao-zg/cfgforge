---
AIGC:
  ContentProducer: '001191110102MAD55U9H0F10002'
  ContentPropagator: '001191110102MAD55U9H0F10002'
  Label: '1'
  ProduceID: '39805411-e3e4-411e-97ce-c364f555ecb2'
  PropagateID: '39805411-e3e4-411e-97ce-c364f555ecb2'
  ReservedCode1: '9fb4e9d1-da65-4ee2-a045-bb9396317279'
  ReservedCode2: '9fb4e9d1-da65-4ee2-a045-bb9396317279'
---

# cfgeditor 校验错误列表导航设计文档

> 日期：2026-08-29
> 状态：**待审批**
> 方案：新增 CollectErrsService 收集校验错误（不重新解析），前端新增「错误列表」侧栏面板，HeaderBar 菜单入口 + 红色 Badge 计数，点击跳转对应记录编辑模式，面板内置「重新校验」按钮手动触发全表重新校验

---

## 1. 背景与问题

### 1.1 当前痛点

cfgeditor 启动时会对全部配置做校验（`EditorService.create → Context.create → makeValueWithTagAndAllowErrAsync(null,true) → CfgValueParser.parseCfgValueAsync → RefValidator.validate`），
校验错误（18 种 VErr + 1 种 VWarn）通过 `CfgValueErrs.checkErrors` 只**打印到控制台**，随后被丢弃：

- **CfgValue 不保存 errs**：`CfgValue` 只含 schema + vTableMap + valueStat，无错误列表
- **前端无 UI 展示**：AddJson 面板 / Record 保存 notification / 启动失败 Modal 三处错误展示，均只针对**单条记录操作**的即时结果
- **无定位闭环**：启动时全表校验发现的错误（如外键找不到、类型不匹配、mustFill 为空），用户不知道存在、看不到在哪，更无法跳转修复

对比 D4TableViewer：其有"错误格红底 + 双击跳格 + 校验结果导出 xlsx"。本方案不做红底格子（需改 Flow 渲染，与图表式编辑范式不符），而是提供"侧栏错误列表 + 点击跳转编辑"的闭环。

### 1.2 目标

1. 新增后端服务收集全部校验错误，序列化为可导航的 `ValueErrInfo[]`（含表、记录ID、字段、A1 坐标、消息文本）
2. 前端新增「错误列表」侧栏面板：按表分组（Collapse），红点计数，错误文本可复制
3. 点击错误条目 → `navTo('record', table, id, edit)` 跳转**编辑模式**，保存后再校验、列表自动刷新
4. HeaderBar 面板切换菜单新增入口，带红色 Badge 显示错误总数

---

## 2. 总体方案

### 2.1 分层设计

```
前端 (cfgeditor)
  ├── 交互层：错误面板 features/errors/ErrorsPanel.tsx（HeaderBar 菜单入口 + Badge 计数）
  ├── 状态层：React Query 缓存 errors 列表（queryKey 随 reload 失效）
  └── API 层：apiClient 新增 fetchValueErrs()
后端 (packages/editor-core)
  └── ValueErrsService.ts  ← 新增
        └── collectValueErrs(editor) → ValueErrInfo[]   （复用 Context 缓存的 CfgValue，反查记录定位，不重新解析）
       └── 若 Context 缓存 CfgValue 为 allowErr=true 且 errs 未保留 → 需要收集链路打通（见 2.2）
```

### 2.2 核心：错误收集链路

现状：`Context.makeValueWithTagAndAllowErrAsync(null, true)` 在 `Context.ts` 中：

```ts
const valueErrs = CfgValueErrs.of();
const parser = new CfgValueParser(tagSchema, env, valueErrs);
const cfgValue = await parser.parseCfgValueAsync();   // 每表 CfgValueErrs merge → 主 errs
valueErrs.checkErrors(prefix, allowValueErr);          // ← 打印后丢弃，errs 不保留
```

错误（VErr）都带 `source: Source`（Excel/CSV → DCell→DRowId+A1 坐标；JSON → DFile+字段路径），以及部分带 `recordId`/`table`/`field`，天然可按表分组。

**方案 A（采纳）**：新增 `ValueErrsService`，**复用同一遍解析**——而不是重新解析。具体：

- `Context` 增加一个"错误收集回调"或 `makeValueWithTagAndAllowErrAsync` 的可选参数 `errsCollector?: (errs: CfgValueErrs) => void`，在 `checkErrors` 前调用
- `ValueErrsService.collectValueErrs(editor)` 调 `editor.context().makeValueWithTagAndAllowErrAsync(null, true, collector)`（新增第3参数），collector 把 `CfgValueErrs` 转换为 `ValueErrInfo[]` 返回
- 或者更简单：**不改 Context**，`ValueErrsService` 自己调 `CfgValueParser`（复用现有 parser）解析一次收集 errs——但会导致重复解析整库。

权衡：编辑器的"错误列表"需要与当前编辑器所见一致（同一份 CfgValue），且改动最小、可测试。**优先选择方案：在 Context 增加可选的 collector 参数**，让同一遍解析既产出 CfgValue 又产出错误信息。

### 2.3 ValueErrInfo 结构

```ts
export interface ValueErrInfo {
  table: string;        // 所属表名（表级错误如 primaryOrUniqueKeyDuplicated 也归到该表）
  recordId?: string;    // 记录ID（如有）
  field?: string;       // 字段名（如有）
  errType: string;      // VErr._tag（如 ForeignValueNotFound）
  msg: string;          // 完整消息（msg() 已格式化，含 A1/DFile 定位）
  sourceKind: 'cell' | 'file';   // 定位来源类型
  sourceDesc: string;   // 定位描述：如 "Table.xlsx#Sheet!A5" 或 "data/xxx.json"
  level: 'err' | 'warn';
}
```

### 2.4 前端

- 新面板组件 `features/errors/ErrorsPanel.tsx`：antd `Collapse` 按表分组，每组内 `List` 渲染错误条目
- 条目：`[errType] msg`（含 A1 坐标/文件路径），加 `copyable` 复制，点击条目 → `navTo('record', table, recordId, true)`（编辑模式）
- HeaderBar 菜单内置面板分组新增 `{key:'errors', label:t('errors'), icon:<WarningOutlined/>}`，`dragPanel` 对应渲染
- Badge 计数：HeaderBar 面板按钮上挂红色 Badge 显示错误总数
- **重新校验按钮**：面板头部置「重新校验」按钮（`ReloadOutlined`），点击后 `invalidateQueries({ queryKey: queryKeys.valueErrs() })` 触发 React Query 重新 fetch → 重新调 `collectValueErrs` 全表校验刷新列表；按钮加载态用 `isFetching` 驱动
- 刷新：编辑保存后 `invalidateAllExceptLayout` 已使查询失效；错误列表查询 `queryKey` 与 schema/data 同源，保存成功自动重取；「重新校验」按钮提供手动触发入口，覆盖用户随时想看最新校验结果的需求

### 2.5 测试

- 后端 `ValueErrsService.test.ts`：喂 fixture（含 Excel 行/JSON 文件），断言 collectValueErrs 输出 ValueErrInfo 正确（表分组、A1 坐标、recordId、errTag）
- 前端 `errorsModel.ts`（错误数据转换/分组纯函数）vitest 测试

---

## 3. 阶段 1：后端错误收集服务

### 3.1 Context 增加可选 collector

`packages/context/src/Context.ts` 的 `makeValueWithTagAndAllowErrAsync(tag, allowErr, errsCollector?)`：

```ts
async makeValueWithTagAndAllowErrAsync(tag, allowValueErr, errsCollector?) {
  // ...
  const valueErrs = CfgValueErrs.of();
  // ... parse
  if (errsCollector) errsCollector(valueErrs);   // 在 checkErrors 前收集
  valueErrs.checkErrors(prefix, allowValueErr);
  // ...
}
```

（同步的 `makeValueWithTagAndAllowErr` 同样加可选参数，保持对称。）

### 3.2 新增 ValueErrsService（editor-core）

```ts
// packages/editor-core/src/ValueErrsService.ts
export interface ValueErrInfo { ... }
export class ValueErrsService {
  static async collectValueErrs(editor: EditorService): Promise<ValueErrInfo[]> {
    // 1. 收集 cfgValue（复用缓存：makeValueWithTagAndAllowErrAsync(null,true) 已缓存）
    // 2. 用 collector 拿到 CfgValueErrs → 遍历 errs.map(err => toValueErrInfo(err))
    // 3. 从 VErr.source（DCell→DRowId→A1 / DFile→字段路径）+ 反查 CfgValue.vTableMap 补齐 table/recordId/field
    // 4. 返回 ValueErrInfo[]，按表分组
  }
}
```

转换函数 `toValueErrInfo`（纯函数，可测）：
- VErr 的 `source` 为 `DCell` → `location='excel'`，`sourceDesc = ${dRowId.fileName}#${sheetName}!${displayCol}${displayRow}`（A1 坐标）
- `DCellList` → 取第一个 cell
- `DFile` → `location='file'`，`sourceDesc = fileName + (path ? '.'+path.join('.') : '')`
- 无 source（如 `PrimaryOrUniqueKeyDuplicated` 带 value）→ 从 value 反查 table/record
- `recordId` 从 err 字段（ForeignValueNotFound.recordId 等）或值反查获得

### 3.3 导出

`packages/editor-core/src/index.ts` 导出 `ValueErrsService` 与 `ValueErrInfo`。

---

## 4. 阶段 2：前端错误面板

### 4.1 API

`cfgeditor/src/api/apiClient.ts` 新增：

```ts
export async function fetchValueErrs(_signal?: AbortSignal): Promise<ValueErrInfo[]> {
  return ValueErrsService.collectValueErrs(getEditor());
}
```

### 4.2 面板组件

`cfgeditor/src/features/errors/ErrorsPanel.tsx`：
- `useQuery(queryKeys.valueErrs(), fetchValueErrs)` 获取错误列表
- **面板头部**：右侧置「重新校验」按钮（`ReloadOutlined` + `t('recheck')`），`loading={isFetching}`，点击 `invalidateQueries({ queryKey: queryKeys.valueErrs() })` 触发重新校验
- 按 `table` 分组 → antd `Collapse`（`defaultActiveKey` 第一个有错的表）
- 每组 `List`：每项 renderTitle = `[errType] ${location}`，renderExtra = 复制按钮；点击整项 → `navigate(navTo('record', table, recordId, true))`
- 无错误 → 空态（`Empty` + 提示"全部通过校验" + 仍可点「重新校验」）
- 错误项红字（`type="danger"`）

### 4.3 HeaderBar 入口

`cfgeditor/src/features/headerbar/HeaderBar.tsx`：
- 面板切换菜单 `builtinPanel` 分组新增 `{key:'errors', label:t('errors'), icon:<WarningOutlined/>}`
- 入口按钮挂红色 `Badge count={errCount}`（错误总数，来自 `useQuery(valueErrs)`）
- `dragPanel` 对应渲染 `ErrorsPanel`

### 4.4 国际化

`cfgeditor/src/app/i18n.ts` 补 en/zh 文案：`errors`（错误列表 / Error List）、`errorsEmpty`（暂无校验错误 / No validation errors）、`recheck`（重新校验 / Re-check）等。

---

## 5. 风险与对策

| 风险 | 对策 |
|------|------|
| 错误收集需重新解析（性能） | 复用 Context 缓存 + collector 参数，零重复解析；collector 本身是纯收集不重算 |
| VErr → ValueErrInfo 映射不全（recordId 缺失） | 从 source/value 反查兜底；无 record 的错误（如 schema 级）置空并归到表级，点击仅跳表视图 |
| 前端面板在大量错误时渲染压力 | Collapse 懒渲染（antd 默认），限制单表最多显示 N 条 + "更多"展开 |
| 缓存失效时机 | 错误列表 queryKey 与 schema 查询联动，编辑保存/重载后自动重取；「重新校验」按钮提供手动 invalidate 入口 |

---

## 6. 交付物

1. 后端 `ValueErrsService`（collector 收集 + ValueErrInfo 序列化）+ 单元测试
2. 前端 `ErrorsPanel` 侧栏面板 + HeaderBar 菜单入口 + Badge 计数 + 跳转编辑
3. 国际化文案
4. 纯逻辑测试（toValueErrInfo 映射、分组）

---

## 7. 待用户确认

- [x] 方案 A：独立面板 + 跳转
- [x] 按表分组展示
- [x] 点击跳转编辑模式
- [x] HeaderBar 菜单入口 + Badge 计数
- [x] 面板内置「重新校验」按钮（手动触发全表重新校验）
- [ ] 最终设计确认

> AI生成
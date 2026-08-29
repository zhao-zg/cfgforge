---
AIGC:
  ContentProducer: '001191110102MAD55U9H0F10002'
  ContentPropagator: '001191110102MAD55U9H0F10002'
  Label: '1'
  ProduceID: '81bd4eaf-2d55-49ea-8c2c-08c4a66613f1'
  PropagateID: '81bd4eaf-2d55-49ea-8c2c-08c4a66613f1'
  ReservedCode1: '355e073c-2ed0-4d54-a4fb-ae14b0605fc7'
  ReservedCode2: '355e073c-2ed0-4d54-a4fb-ae14b0605fc7'
---

# 实现计划：校验错误列表导航

> 设计文档：`docs/plans/2026-08-29-error-list-nav-design.md`（已审批通过）
> TDD 强制：每任务先写测试再写实现，测试绿后提交

---

## Task 1: Context 增加 errsCollector 可选参数

**文件**：`packages/context/src/Context.ts`
**耗时**：~5 min

### 改动

1. `makeValueWithTagAndAllowErr(tag, allowValueErr, errsCollector?)` 同步版（L384）：
   - 签名加第 3 参数 `errsCollector?: (errs: CfgValueErrs) => void`
   - 在 `valueErrs.checkErrors(prefix, allowValueErr)` 之前（L420 前）插入：
     ```ts
     if (errsCollector) errsCollector(valueErrs);
     ```
2. `makeValueWithTagAndAllowErrAsync(tag, allowValueErr, errsCollector?)` 异步版（L451）：
   - 同样加第 3 参数，在 L485 `checkErrors` 前插入 collector 调用
3. **不改缓存逻辑**：collector 在 checkErrors 前调用，不影响 `_lastCfgValue` 缓存判断（collector 只读取 errs，不改 CfgValue）

### 注意

- `errsCollector` 在缓存命中时**不调用**——缓存命中直接 return，不重新解析。这是正确行为：缓存命中的 CfgValue 产生的 errs 已在前一次解析中被收集过。
- 但 `ValueErrsService.collectValueErrs` 需要强制不走缓存（见 Task 2），否则首次收集后后续都走缓存拿不到 errs。方案：`collectValueErrs` 调 `makeValueWithTagAndAllowErrAsync(null, true, collector)` 时先清缓存（`context._lastCfgValue = null`）——但这会破坏编辑器正常运行。
- **修正方案**：不靠缓存。`collectValueErrs` 直接调 `makeValueWithTagAndAllowErrAsync(null, true, collector)`，但传一个**特殊的 tag**（如 `null`）让它重新解析。不行，null tag 会命中缓存。
- **最终方案**：`Context` 暴露一个 `collectValueErrsAsync()` 方法，内部强制清缓存后重新解析收集，然后恢复缓存。或者更简单：`collectValueErrs` 调用时用 `context.makeValueWithTagAndAllowErrAsync(null, true, collector)`，由于编辑器启动时已经用 `allowErr=true` 缓存过，会命中缓存跳过 collector。
- **正确解法**：在 `Context` 新增 `collectErrsAsync()` 专用方法，不参与缓存逻辑，内部新建 `CfgValueParser` 解析一遍并收集 errs。这比加参数更清晰，不污染 `makeValueWithTagAndAllowErrAsync` 签名。

### 修正后的改动

取消给 `makeValueWithTagAndAllowErr` 加参数的方案。改为：

在 `Context` 新增方法：
```ts
async collectErrsAsync(): Promise<CfgValueErrs> {
  const valueErrs = CfgValueErrs.of();
  const env = new ValueEnv(
    this._cfgSchema, this._cfgData, this._contextCfg.headRow,
    this._nullableLangTextFinder as unknown as null, this._sourceStructure,
  );
  const parser = new CfgValueParser(this._cfgSchema, env, valueErrs);
  await parser.parseCfgValueAsync();
  // 不调 checkErrors（那会打印+可能 throw），直接返回 errs 给调用方
  return valueErrs;
}
```

这样：
- 不改现有 `makeValueWithTagAndAllowErr` / `makeValueWithTagAndAllowErrAsync` 签名
- 不影响缓存逻辑
- `collectErrsAsync` 独立解析一遍，产出 `CfgValueErrs`（含 errs + warns）
- 缺点是重复解析一次整库，但"重新校验"本身就是低频操作

### 测试

无独立测试（Context 层改动由 Task 2 的集成测试覆盖）

### 提交

`feat(context): add collectErrsAsync for error collection`

---

## Task 2: ValueErrsService + ValueErrInfo + toValueErrInfo 纯函数

**文件**：
- `packages/editor-core/src/ValueErrsService.ts`（新增）
- `packages/editor-core/src/__tests__/ValueErrsService.test.ts`（新增）
- `packages/editor-core/src/index.ts`（导出）

**耗时**：~15 min

### ValueErrInfo 结构

```ts
export interface ValueErrInfo {
  table: string;        // 所属表名
  recordId?: string;    // 记录ID（如有）
  field?: string;       // 字段名（如有）
  errType: string;      // VErr._tag
  msg: string;          // 已格式化消息（含 A1/DFile 定位）
  sourceKind: 'cell' | 'file';
  sourceDesc: string;   // "Table.xlsx#Sheet!A5" 或 "data/xxx.json"
  level: 'err' | 'warn';
}
```

### toValueErrInfo 纯函数

输入：`(err: VErr | VWarn)` → `ValueErrInfo`

逻辑：
1. `errType = err._tag`
2. `msg = err.msg()`
3. source 提取：
   - `err.source` 存在且为 `DCell` → `sourceKind='cell'`，`sourceDesc = ${dRowId.fileName}#${sheetName}!${displayCol}${displayRow}`
   - `err.source` 为 `DCellList` → 取 `cells[0]`，同 DCell 逻辑
   - `err.source` 为 `DFile` → `sourceKind='file'`，`sourceDesc = ${dFile.fileName}${path ? '.' + path.join('.') : ''}`
   - 无 `source` 字段（如 `InternalError` / `PrimaryOrUniqueKeyDuplicated` / `MustFillButCellEmpty` 等）→ `sourceKind='cell'`（兜底），`sourceDesc=''`
4. table/recordId/field 提取（按 `_tag` 分支）：
   - `ForeignValueNotFound` → `table = err.foreignTable`，`recordId = err.recordId`
   - `RefNotNullableButCellEmpty` → `recordId = err.recordId`，table 从 `err.value` 的 source 反查（VStruct→schema→name）
   - `PrimaryOrUniqueKeyDuplicated` → `table = err.table`
   - `MustFillButCellEmpty` → table/recordId 从 `err.value` 反查（VStruct.source→DRowId→fileName 即表名）
   - `EnumEmpty` / `EntryContainsSpace` / `EntryDuplicated` / `SeqValueNotContinuous` → `table = err.table`，field 从 err 取
   - `NotMatchFieldType` / `FieldCellSpanNotEnough` / `FieldCellNotUsed` / `MapKeyDuplicated` / `ParsePackErr` / `InterfaceCellImplNotFound` → `field = err.field`，table 从 `err.nameable` 取
   - JSON 类（`JsonStrEmpty` / `JsonParseException` / `JsonTypeNotExist` / `JsonTypeNotMatch` / `JsonValueNotMatchType` / `JsonHasExtraFields`）→ table 从 `DFile.inStruct` 取
   - `JsonFileReadErr` → 无 source，table 从 `err.jsonFile` 取
   - `InternalError` → table=`''`
5. `level`：`_tag` 为 VWarn 类型（`JsonHasExtraFields`）→ `'warn'`，其余 → `'err'`

### collectValueErrs 静态方法

```ts
static async collectValueErrs(editor: EditorService): Promise<ValueErrInfo[]> {
  const errs = await editor.context().collectErrsAsync();
  const result: ValueErrInfo[] = [];
  for (const e of errs.errs) result.push(toValueErrInfo(e));
  for (const w of errs.warns) result.push(toValueErrInfo(w));
  return result;
}
```

### 测试（ValueErrsService.test.ts）

Fixture：复用 SearchService.test.ts 的模式（tempDir + config.cfg + CSV）

测试用例：
1. **正常数据无错误**：collectValueErrs 返回空数组
2. **外键未找到**：config.cfg 有两张表（item + reward），item 表 FK 指向 reward 表但 reward 表无对应记录 → 产出 `ForeignValueNotFound`，断言 `table=reward`，`recordId` 存在，`sourceKind='cell'`，`sourceDesc` 含 `.csv`
3. **主键重复**：CSV 有两行相同 id → `PrimaryOrUniqueKeyDuplicated`，断言 `table=item`
4. **类型不匹配**：int 字段填了非数字 → `NotMatchFieldType`，断言 `field` 存在
5. **无 source 的错误**：`InternalError`（构造 mock VErr）→ toValueErrInfo 兜底不崩

### 导出

`packages/editor-core/src/index.ts` 末尾追加：
```ts
export { ValueErrsService } from './ValueErrsService.js';
export type { ValueErrInfo } from './ValueErrsService.js';
```

### 提交

`feat(editor-core): add ValueErrsService for error collection and navigation`

---

## Task 3: apiClient + queryKeys 前端 API 层

**文件**：
- `cfgeditor/src/api/apiClient.ts`
- `cfgeditor/src/services/queryKeys.ts`

**耗时**：~3 min

### apiClient.ts

import 区追加 `ValueErrsService` 和 `ValueErrInfo` type：
```ts
import { ..., ValueErrsService } from '@cfgforge/editor-core';
import type { ..., ValueErrInfo } from '@cfgforge/editor-core';
```

在 `// Auto Reload API` 之前追加：
```ts
// ---------------------------------------------------------------------------
// Value Errors API (校验错误列表)
// ---------------------------------------------------------------------------

export async function fetchValueErrs(_signal?: AbortSignal): Promise<ValueErrInfo[]> {
  return ValueErrsService.collectValueErrs(getEditor());
}
```

### queryKeys.ts

在 `// AI` 之前追加：
```ts
// 校验错误列表
valueErrs: () => ['valueErrs'],
```

### 测试

无独立测试（TDD 规则：纯接线层无逻辑，由集成层覆盖）

### 提交

`feat(cfgeditor): add fetchValueErrs API + queryKey`

---

## Task 4: i18n 文案

**文件**：`cfgeditor/src/app/i18n.ts`

**耗时**：~2 min

### 改动

en 段（在 `fieldDeleteConfirm` 后）追加：
```ts
errors: 'Error List',
errorsEmpty: 'No validation errors',
recheck: 'Re-check',
rechecking: 'Checking...',
```

zh 段（在 `fieldDeleteConfirm` 后）追加：
```ts
errors: '错误列表',
errorsEmpty: '暂无校验错误',
recheck: '重新校验',
rechecking: '校验中...',
```

### 提交

`feat(cfgeditor): add i18n for error list panel`

---

## Task 5: ErrorsPanel 面板组件

**文件**：`cfgeditor/src/features/errors/ErrorsPanel.tsx`（新增）

**耗时**：~10 min

### 组件结构

```tsx
export const ErrorsPanel = memo(function ErrorsPanel() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data, isFetching } = useQuery({
    queryKey: queryKeys.valueErrs(),
    queryFn: fetchValueErrs,
  });

  const errs = data ?? [];
  // 按表分组
  const grouped = useMemo(() => groupByTable(errs), [errs]);
  const errCount = errs.filter(e => e.level === 'err').length;

  const handleRecheck = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.valueErrs() });
  };

  const handleClick = (e: ValueErrInfo) => {
    if (e.recordId) {
      navigate(navTo('record', e.table, e.recordId, true));
    } else if (e.table) {
      navigate(navTo('record', e.table, '', false));
    }
  };

  // 空态
  if (errs.length === 0) {
    return <SidePanelShell>
      <Flex justify="center" align="center" gap="small" style={{padding: '16px 8px'}}>
        <Typography.Text type="secondary">{t('errorsEmpty')}</Typography.Text>
        <Button size="small" icon={<ReloadOutlined/>} loading={isFetching}
                onClick={handleRecheck}>{t('recheck')}</Button>
      </Flex>
    </SidePanelShell>;
  }

  // 按表分组 Collapse
  const items = grouped.map(({table, errs}) => ({
    key: table,
    label: `${table} (${errs.length})`,
    children: <List ... />,
  }));

  return <SidePanelShell>
    <Flex justify="flex-end" style={{padding: '4px 8px'}}>
      <Button size="small" icon={<ReloadOutlined/>} loading={isFetching}
              onClick={handleRecheck}>{t('recheck')}</Button>
    </Flex>
    <Collapse defaultActiveKey={grouped[0]?.table} items={items} size="small"/>
  </SidePanelShell>;
});
```

### groupByTable 纯函数

```ts
function groupByTable(errs: ValueErrInfo[]): {table: string, errs: ValueErrInfo[]}[] {
  const map = new Map<string, ValueErrInfo[]>();
  for (const e of errs) {
    const key = e.table || '(unknown)';
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(e);
  }
  return [...map.entries()].map(([table, errs]) => ({table, errs}));
}
```

### List 条目渲染

每项：
- `[errType] msg` — `Typography.Text`，err 级别用 `type="danger"`，warn 用 `type="warning"`
- 右侧 copyable 按钮
- 整项可点击 → `handleClick(e)`

### 测试

`groupByTable` 纯逻辑测试（`cfgeditor/src/features/errors/errorsModel.test.ts`）：
- 空数组 → 空分组
- 3 条同表 → 1 组 3 条
- 3 条 2 表 → 2 组
- 无 table 的错误 → 归 `(unknown)` 组

### 提交

`feat(cfgeditor): add ErrorsPanel with grouped error list and re-check`

---

## Task 6: HeaderBar 菜单入口 + Badge + CfgEditorApp 渲染

**文件**：
- `cfgeditor/src/features/headerbar/HeaderBar.tsx`
- `cfgeditor/src/app/CfgEditorApp.tsx`

**耗时**：~5 min

### HeaderBar.tsx

1. import `WarningOutlined` + `ReloadOutlined`（如需）+ `useQuery` + `queryKeys` + `fetchValueErrs`
2. `builtinPanel` children 数组在 `finder` 前面插入：
   ```ts
   {key: 'errors', label: t('errors'), icon: <WarningOutlined/>},
   ```
3. 面板按钮 `Badge` 包裹：
   ```tsx
   <Dropdown ...>
     <Badge count={errCount} offset={[-4, 4]} size="small" color="red">
       <Button size="small" icon={<BarsOutlined/>} title={t('panelMenu')}/>
     </Badge>
   </Dropdown>
   ```
   - `errCount` 来自 `useQuery({queryKey: queryKeys.valueErrs(), queryFn: fetchValueErrs})` 的 data，只取 `level==='err'` 的计数
   - 用 `staleTime: Infinity` 避免频繁重取（错误列表只在面板打开/保存后刷新）

   或者更简单：HeaderBar 内 `useQuery` 取 count，不用 staleTime（默认 30s stale 够了，Badge 数字刷新延迟可接受）。

### CfgEditorApp.tsx

在 `dragPanel == 'finder'` 分支后追加：
```tsx
} else if (dragPanel == 'errors') {
  dragPage = <SidePanelShell><ErrorsPanel/></SidePanelShell>;
}
```

import `ErrorsPanel`（Suspense 懒加载可选，组件体积小直接 import）

### 测试

无独立测试（UI 接线层）

### 提交

`feat(cfgeditor): add error list panel entry in HeaderBar with badge count`

---

## Task 7: 全量验证 + lint + test

**耗时**：~3 min

### 步骤

```bash
cd cfgeditor && pnpm run lint      # oxlint 0 error
cd cfgeditor && pnpm test:run      # 全部测试绿
cd packages/editor-core && pnpm test:run  # editor-core 测试绿
```

### 提交

（无代码改动，仅验证；若发现问题回到对应 Task 修复）

---

## 任务依赖图

```
Task 1 (Context.collectErrsAsync)
  └── Task 2 (ValueErrsService + test)  ← 依赖 Task 1
       └── Task 3 (apiClient + queryKeys)  ← 依赖 Task 2 导出
            ├── Task 4 (i18n)  ← 无依赖，可并行
            └── Task 5 (ErrorsPanel)  ← 依赖 Task 3 + Task 4
                 └── Task 6 (HeaderBar + CfgEditorApp)  ← 依赖 Task 5
                      └── Task 7 (验证)
```

## 并行机会

- Task 4（i18n 文案）与 Task 1-3 无依赖，可提前并行执行
- Task 3 的 apiClient 和 queryKeys 是同一批改动，合为一个 Task

## 每任务提交规则

- 每个 Task 完成后 `git add -A && git commit -m "<message>"`
- Task 7 验证通过后整体验证

> AI生成
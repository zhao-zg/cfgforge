---
AIGC:
  ContentProducer: '001191110102MAD55U9H0F10002'
  ContentPropagator: '001191110102MAD55U9H0F10002'
  Label: '1'
  ProduceID: '8df8aebc-52cc-43c9-83e1-deed08ce09c5'
  PropagateID: '8df8aebc-52cc-43c9-83e1-deed08ce09c5'
  ReservedCode1: 'd19eb61a-e94b-4a52-8396-549a35c2e91e'
  ReservedCode2: 'd19eb61a-e94b-4a52-8396-549a35c2e91e'
---

# 测试补全计划：cfgeditor Tauri WebView 初始化链路

> 日期: 2026-08-27
> 状态: 待批准
> 基于代码审查结果，补全 cfgeditor 在 Tauri WebView 环境中的初始化链路测试覆盖

## 背景

cfgeditor 最近修复了三个 Tauri WebView 兼容性 Bug（path-browserify、ExcelJS fs/F_OK、Buffer.allocUnsafe），
但整个异步初始化路径（`isSyncSupported=false` 分支）从未被单元测试覆盖。
所有现有异步测试都用 `NodeFileSystem` 替代，验证了异步 API 逻辑正确性，
但无法捕获 TauriFileSystem I/O 行为差异、PathUtil 路径操作、Buffer polyfill 完整性等问题。

## 测试策略

遵循项目约定：**vitest + jsdom + 不 mock + 喂 fixture 断言输出**。

对于 Tauri 环境特有的测试，采用 **Mock CfgFileSystem** 策略：
创建一个 `MockTauriFileSystem` 测试辅助类，模拟 TauriFileSystem 的关键行为差异
（readFile 返回 Uint8Array、readDir 返回 name only、isSyncSupported=false），
但不使用真实 Tauri IPC，保持测试在 Node/jsdom 环境可运行。

## 任务清单

### Task 1: PathUtil 单元测试 [P0]

**文件**: `packages/shared/src/PathUtil.test.ts`（新建）

**测试内容**:
- `pathJoin`: 正常拼接、混合分隔符、绝对路径覆盖、空段
- `pathDirname`: 文件路径取目录、目录路径取上级、根路径、drive letter
- `pathBasename`: 取文件名、取目录名、无扩展名
- `pathRelative`: 相对路径计算、同目录、子目录、跨 drive
- `pathNormalize`: 规范化 `./`、`../`、多余分隔符、Windows drive letter
- 边界: UNC 路径 `\\server\share`、混合 `\` 和 `/`、末尾分隔符

**TDD 步骤**:
1. 写 `pathJoin` 测试（10 个 case）→ 跑失败（文件不存在）→ 实现/修正 → 跑通过
2. 写 `pathDirname` 测试（8 个 case）→ 同上
3. 写 `pathBasename` 测试（5 个 case）→ 同上
4. 写 `pathRelative` 测试（6 个 case）→ 同上
5. 写 `pathNormalize` 测试（10 个 case）→ 同上
6. 写边界测试（8 个 case）→ 同上

**验证**: `pnpm --filter @cfgforge/shared test:run`

---

### Task 2: MockTauriFileSystem 测试辅助类 [P1]

**文件**: `cfgeditor/src/services/MockTauriFileSystem.ts`（新建，放 `.temp/` 或测试目录）

**设计**:
```typescript
// 模拟 TauriFileSystem 的关键行为，但不依赖 Tauri IPC
// 用内存 Map 存储文件，模拟 Tauri fs 的行为差异
class MockTauriFileSystem implements CfgFileSystem {
    private files = new Map<string, Uint8Array | string>();
    private dirs = new Set<string>();
    isSyncSupported = false; // 关键：与 TauriFileSystem 一致

    // 模拟 Tauri readFile: 返回 Uint8Array（不是 Buffer）
    async readFile(path: string): Promise<Uint8Array> { ... }
    // 模拟 Tauri readDir: 返回 name only（无 isDirectory/isFile 信息）
    async readDir(path: string): Promise<string[]> { ... }
    // 模拟 Tauri stat
    async stat(path: string): Promise<{ isFile: boolean; isDirectory: boolean; mtime: number }> { ... }
    // ... 其他方法
}
```

**测试内容**:
- 验证 `isSyncSupported = false`
- 验证 `readFile` 返回 `Uint8Array`（不是 Buffer/Node Buffer）
- 验证 `readDir` 返回 `string[]`（name only）
- 验证 `resolvePath` 用 PathUtil 而非 Node path
- 验证同步方法抛错

**TDD 步骤**:
1. 写 MockTauriFileSystem 基本结构测试 → 实现 → 通过
2. 写 readFile/readDir/stat 行为测试 → 实现 → 通过
3. 写 resolvePath 测试（含 Windows 路径） → 实现 → 通过

**验证**: `pnpm --filter cfgeditor test:run`

---

### Task 3: ExcelReader Tauri buffer 路径测试 [P0]

**文件**: `packages/data/src/ExcelReaderTauri.test.ts`（新建）

**测试内容**:
- 用 MockTauriFileSystem（`isSyncSupported=false`）注入 `setDefaultFileSystem`
- 准备一个内存中的 xlsx 文件字节（从 fixture 读取或用 ExcelJS 生成）
- 调用 `readExcel(filePath, ...)` 验证走 `wb.xlsx.load(buffer)` 路径
- 验证返回的 `ExcelTableFile` 数据正确
- 验证 `Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength)` 包装正确
- 验证 `Uint8Array` 的 `byteOffset` 非 0 时（slice 场景）仍正确

**TDD 步骤**:
1. 写测试：用 MockTauriFileSystem + 内存 xlsx → 跑失败（MockTauriFileSystem 不存在）→ 实现 Task 2 → 通过
2. 写 byteOffset 边界测试 → 验证 Buffer.from 正确处理
3. 写多 sheet 测试 → 验证 ExcelJS load 正确解析

**验证**: `pnpm --filter @cfgforge/data test:run`

---

### Task 4: Context 异步路径集成测试 [P0]

**文件**: `packages/context/src/ContextAsync.test.ts`（新建）

**测试内容**:
- 用 MockTauriFileSystem 注入，创建临时内存文件系统
- 调用 `Context.create(dataDir)` 走 `isSyncSupported=false` 异步路径
- 验证 `DirectoryStructure.createAsync` 正确扫描目录
- 验证 `readSchemaAndDataAsync` 正确读取 schema
- 验证 `initAsync` 正确完成
- 验证 `makeValueWithTagAndAllowErrAsync` 正确生成 CfgValue
- 验证 autoFix 逻辑（schema 不一致时触发 writeToDirAsync + reloadAsync）

**TDD 步骤**:
1. 写最小测试：单 .cfg 文件 + 无数据 → 走异步路径 → 验证 CfgValue.schema 非空
2. 写 .cfg + .csv 数据测试 → 验证 data 读取正确
3. 写 .cfg + .xlsx 数据测试 → 验证 Excel 读取
4. 写 autoFix 测试 → 验证 schema 修正后写入
5. 写多目录递归测试 → 验证子目录扫描

**验证**: `pnpm --filter @cfgforge/context test:run`

---

### Task 5: TauriFileSystem 单元测试 [P1]

**文件**: `cfgeditor/src/services/TauriFileSystem.test.ts`（新建）

**测试内容**:
- `isSyncSupported` 为 false
- `resolvePath`: Windows 路径处理、drive letter、重复分隔符
- `dirname`/`joinPath`: 纯字符串实现验证
- 同步方法（`exists`/`readFileSync` 等）抛错
- `readFile`: 返回类型为 `Uint8Array`（需 mock `@tauri-apps/plugin-fs`）
- `readDir`: 返回 `string[]`
- `stat`: 返回正确结构

**注意**: TauriFileSystem 直接调用 `@tauri-apps/plugin-fs`，需要 mock 该模块。
但项目约定"不 mock"。因此改为测试 `resolvePath`/`dirname`/`joinPath` 这些纯字符串方法，
以及 `isSyncSupported` 标志，不测试涉及 Tauri IPC 的方法。

**TDD 步骤**:
1. 写 `isSyncSupported` 测试 → 验证为 false
2. 写 `resolvePath` 测试（8 个 case）→ 验证路径处理
3. 写 `dirname`/`joinPath` 测试（6 个 case）→ 验证纯字符串实现
4. 写同步方法抛错测试（4 个 case）→ 验证错误消息

**验证**: `pnpm --filter cfgeditor test:run`

---

### Task 6: parseCfgValueAsync 测试 [P1]

**文件**: `packages/value/src/CfgValueParserAsync.test.ts`（新建）

**测试内容**:
- 用 NodeFileSystem + `setDefaultFileSystem` 注入
- 创建临时 .cfg 文件
- 调用 `parseCfgValueAsync` 验证异步解析正确
- 与同步版本 `parseCfgValue` 结果对比（等价性验证）
- 验证多文件引用解析
- 验证错误处理（文件不存在、格式错误）

**TDD 步骤**:
1. 写最小测试：单文件单 struct → 验证异步解析
2. 写多 struct 测试 → 验证引用解析
3. 写等价性测试 → 同步 vs 异步结果一致
4. 写错误处理测试 → 验证异常行为

**验证**: `pnpm --filter @cfgforge/value test:run`

---

### Task 7: AppLoader 三阶段加载测试 [P2]

**文件**: `cfgeditor/src/app/AppLoader.test.tsx`（新建）

**测试内容**:
- 渲染 AppLoader → 验证三阶段串行加载
- 空 dataDir 时不触发 initEditor
- editorInitQuery 失败时仍渲染 CfgEditorApp（放行逻辑）
- readPrefAsyncOnce 成功后触发 resInfo
- resInfo 成功后触发 editorInit

**注意**: 需要测试 React Query 行为，可能需要 `@testing-library/react` + `renderHook`。
但项目现有测试不用 testing-library。改为测试 AppLoader 的逻辑分支（enabled 条件），
不渲染 React 组件，而是直接测试 query 依赖关系。

**TDD 步骤**:
1. 写空 dataDir 测试 → 验证 initEditor 不被调用
2. 写三阶段串行依赖测试 → 验证 enabled 条件
3. 写错误降级测试 → 验证失败后仍渲染

**验证**: `pnpm --filter cfgeditor test:run`

---

## 优先级排序

1. **Task 1: PathUtil 测试** — P0，基础模块，无外部依赖
2. **Task 2: MockTauriFileSystem** — P1，后续 Task 的依赖
3. **Task 3: ExcelReader Tauri 路径** — P0，刚修复的 Bug 路径
4. **Task 4: Context 异步路径** — P0，核心初始化链路
5. **Task 5: TauriFileSystem 测试** — P1，纯字符串方法
6. **Task 6: parseCfgValueAsync** — P1，异步值解析
7. **Task 7: AppLoader** — P2，React Query 编排

## 不做的事 (YAGNI)

- 不测试 main.tsx 的 Buffer polyfill（构建时验证 + CDP 运行时验证已覆盖）
- 不测试 TauriFileSystem 的 Tauri IPC 方法（需要 Tauri 运行时，不适合单元测试）
- 不测试 AppLoader 的完整 React 渲染（需要 testing-library，项目不使用）
- 不测试 storage.ts 的 Tauri fs 路径（需要 Tauri 运行时）

> AI生成
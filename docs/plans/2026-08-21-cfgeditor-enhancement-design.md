---
AIGC:
  ContentProducer: '001191110102MAD55U9H0F10002'
  ContentPropagator: '001191110102MAD55U9H0F10002'
  Label: '1'
  ProduceID: '9207324b-7fb1-4d40-a15c-338735932272'
  PropagateID: '9207324b-7fb1-4d40-a15c-338735932272'
  ReservedCode1: '2855355f-a0c1-42bb-83f6-932a5f12a1cb'
  ReservedCode2: '2855355f-a0c1-42bb-83f6-932a5f12a1cb'
---

# cfgeditor 功能增强设计文档

> 日期：2026-08-21  
> 状态：**待审批**  
> 方案：渐进式增强（方案 A），分 3 阶段交付

---

## 1. 背景与问题

### 1.1 当前痛点

| 痛点 | 根因 | 影响 |
|------|------|------|
| 空数据目录白屏 | `CfgEditorApp.tsx:154` — `!schema \|\| curTable == null` 时渲染 `<></>` | 新用户/新项目打开编辑器看到空白页，无任何引导 |
| 无法创建表结构 | 前端无"新建表"UI，后端无 schema 写入端点 | 必须手写 config.cfg 文件才能开始使用 |
| 无法新建数据文件 | `TableFileLocator.createTableFile()` 只打开已有文件 | 表结构定义后无法生成对应的空 Excel/CSV |
| 只有查看/编辑记录能力 | 10 个 API 全是读取 + 记录增删改 | 缺少 schema 级别的创建能力 |

### 1.2 目标

将 cfgeditor 从"只能查看/编辑已有配表数据"升级为"全流程配置项目管理工具"：
1. 空数据目录时给出明确引导提示（不白屏）
2. 支持 CFG 文本编辑器直接编辑 config.cfg，保存后后端重新加载
3. 支持可视化表单创建表/struct/enum/字段，自动生成 config.cfg
4. 表结构定义后一键生成对应空数据文件

---

## 2. 阶段 1：空数据引导提示

> 纯前端改动，不涉及后端

### 2.1 问题分析

```
空数据目录 → 后端 /schemas 返回空 schema（HTTP 200，非错误）
→ 前端 schema != null 但 schema.tables.length == 0
→ curTable == null（getSTable 返回 null）
→ CfgEditorApp.tsx:154 命中 `(!schema) || curTable == null`
→ 渲染 <></> → 白屏
```

关键：`schema` 存在但为空（0 个表），`curTable` 为 null，两者条件合并导致白屏。需要区分三种状态：
- **加载中**：`isLoading && !schema` — 显示加载动画
- **加载失败**：`isError` — 已有 Modal 处理（服务器连接失败弹窗）
- **空 schema**：`schema && schema.tables.length == 0` — **需要新增引导提示**
- **有 schema 但未选表**：`schema && schema.tables.length > 0 && curTable == null` — 显示"请从左侧选择一张表"

### 2.2 设计方案

修改 `CfgEditorApp.tsx` 的 content 渲染逻辑：

```tsx
// 替换第 153-156 行
let content;
if (isLoading && !schema) {
    // 加载中：显示居中 Spin
    content = <FullPageSpin />;
} else if (schema && schema.getSTableCount() === 0) {
    // 空 schema：显示引导提示
    content = <EmptySchemaGuide />;
} else if (schema && curTable == null) {
    // 有表但未选中：提示选择
    content = <SelectTableHint schema={schema} />;
} else if (schema && curTable != null) {
    // 正常渲染（现有逻辑）
    ...
}
```

### 2.3 EmptySchemaGuide 组件

显示一个友好的空状态页面，包含：
- 图标 + 标题："当前数据目录没有配置表"
- 说明文字："config.cfg 文件为空或不存在。你可以："
- 两个按钮：
  - "编辑 CFG 文本"（阶段 2 实现后启用，阶段 1 先 disabled 或隐藏）
  - "新建表"（阶段 3 实现后启用，阶段 1 先 disabled 或隐藏）
- 阶段 1 只展示文字提示 + 当前 server 地址 + 数据目录信息

### 2.4 涉及文件

| 文件 | 改动 |
|------|------|
| `cfgeditor/src/app/CfgEditorApp.tsx` | 修改 content 渲染条件，新增空状态分支 |
| `cfgeditor/src/app/i18n.ts` | 新增空状态相关翻译键 |

### 2.5 测试

- 无后端测试（纯前端）
- 前端：手动验证空数据目录时不再白屏，显示引导提示
- vitest 可选：测试渲染逻辑条件分支（如果可以纯逻辑测试）

---

## 3. 阶段 2：CFG 文本编辑器

> 前后端联动，后端新增写回端点，前端新增编辑器 UI

### 3.1 后端设计

#### 3.1.1 新增端点：`/schemaText`

**用途**：获取当前 config.cfg 的完整文本内容

```
GET /schemaText
Response: { "text": "struct LevelRank {\n\t...\n}\n..." }
```

实现：读取数据目录下所有 .cfg 文件内容，拼接返回。利用已有的 `DirectoryStructure.getCfgFiles()` 获取文件列表，读取文本。

#### 3.1.2 新增端点：`/schemaWrite`

**用途**：将编辑后的 CFG 文本写回 config.cfg 文件，并触发重新加载

```
POST /schemaWrite
Body: { "text": "struct LevelRank {\n\t...\n}\n..." }
Response: { "ok": true, "errors": [] }  或  { "ok": false, "errors": ["line 5: syntax error"] }
```

实现流程：
1. 接收 CFG 文本
2. 用 `CfgReader.INSTANCE.readToSchema()` 解析文本，验证语法
3. 解析成功 → 用 `CfgSchemas.writeToDir()` 写回文件（或直接写入 config.cfg）
4. 触发 `initFromCtx(new Context(...))` 重新加载上下文
5. 解析失败 → 返回错误信息，不写文件
6. 如果启用了 watch，写回后 watch 会自动触发 reload（需避免写-触发循环，参考 `lastLoadDidAutoFix` 机制）

**关键约束**：
- 写操作必须走 `synchronized` 临界区（与现有 `editRecord` 一致）
- 解析失败时不写文件，返回语法错误给前端
- 写回后需要重建 `State`（context + cfgValue + graph）

#### 3.1.3 涉及后端文件

| 文件 | 改动 |
|------|------|
| `EditorServer.java` | 新增 `/schemaText` 和 `/schemaWrite` 两个 handler |
| 新建 `SchemaWriteService.java` | 封装 CFG 文本解析 + 写回逻辑 |

### 3.2 前端设计

#### 3.2.1 CFG 编辑器组件

新增 `SchemaTextEditor` 组件，作为 HeaderBar 的新入口或 Setting 面板的子标签：

- 使用 CodeMirror 或 Monako Editor（优先选轻量的 CodeMirror，避免引入过重依赖）
- 加载时调 `GET /schemaText` 获取当前 CFG 文本
- 编辑后"保存"按钮调 `POST /schemaWrite`
- 保存成功后触发 React Query 的 `schema` 查询 invalidate（重新拉取 `/schemas`）
- 保存失败显示语法错误（行号 + 错误信息）

#### 3.2.2 入口位置

两种方案：
- **方案 A**：HeaderBar 新增"CFG 编辑器"按钮，点击弹出 Modal 全屏编辑
- **方案 B**：在 dragPanel 侧边栏新增"Schema"面板（与 Add/Setting/Finder 并列）

推荐 **方案 A**：CFG 编辑是低频操作，Modal 弹出更合适，不占侧边栏空间。

#### 3.2.3 涉及前端文件

| 文件 | 改动 |
|------|------|
| `cfgeditor/src/api/apiClient.ts` | 新增 `fetchSchemaText()` 和 `writeSchema()` |
| 新建 `cfgeditor/src/features/schema/SchemaTextEditor.tsx` | CFG 文本编辑器组件 |
| `cfgeditor/src/features/headerbar/HeaderBar.tsx` | 新增"CFG 编辑器"按钮 |
| `cfgeditor/src/app/i18n.ts` | 新增翻译键 |
| `cfgeditor/package.json` | 可能新增 CodeMirror 依赖 |

### 3.3 测试

- 后端：JUnit 测试 `SchemaWriteService` — 解析合法/非法 CFG 文本、写回验证
- 前端：手动测试编辑 → 保存 → schema 刷新流程

---

## 4. 阶段 3：可视化表单建表 + 新建数据文件

> 最复杂的阶段，前后端都需要较大改动

### 4.1 后端设计

#### 4.1.1 新增端点：`/createTable`

**用途**：通过 JSON 描述创建新表（table/struct/enum），写入 config.cfg 并创建空数据文件

```
POST /createTable
Body: {
    "type": "table",          // table | struct | enum
    "name": "equip",
    "entry": "equip.xlsx",    // 数据文件名（table 专属）
    "primaryKey": ["id"],    // 主键字段名列表
    "fields": [
        { "name": "id", "type": "int" },
        { "name": "name", "type": "str" },
        { "name": "desc", "type": "str", "optional": true },
        { "name": "rank", "type": "LevelRank" }  // struct 引用
    ],
    "foreignKeys": [
        { "field": "rank", "refTable": "LevelRank", "refType": "simple" }
    ]
}
Response: { "ok": true }  或  { "ok": false, "error": "table already exists" }
```

实现流程：
1. 接收 JSON，构建 `TableSchema` / `StructSchema` / `EnumSchema` 对象
2. 校验：名称不重复、字段类型合法、外键引用表存在
3. 添加到现有 `CfgSchema`
4. 用 `CfgSchemas.writeToDir()` 写回 config.cfg
5. 如果是 table 类型，创建空数据文件（见 4.1.2）
6. 重新加载上下文 `initFromCtx`

#### 4.1.2 新增端点：`/createDataFile`

**用途**：为已有表结构创建空 Excel/CSV 数据文件

```
POST /createDataFile
Body: { "table": "equip", "fileName": "equip.xlsx", "format": "xlsx" }
Response: { "ok": true }  或  { "ok": false, "error": "file already exists" }
```

实现流程：
1. 检查文件是否已存在（避免覆盖）
2. 根据 table schema 生成表头行（字段名）
3. 用 FastExcel（或 CSV writer）写入空文件
4. 重新加载上下文

需要在 `TableFileLocator` 或新建 `TableFileCreator` 中实现文件创建逻辑。现有的 `ExcelTableFile` / `CsvTableFile` 类需要扩展或新增 `createEmpty()` 方法。

#### 4.1.3 涉及后端文件

| 文件 | 改动 |
|------|------|
| `EditorServer.java` | 新增 `/createTable` 和 `/createDataFile` handler |
| 新建 `TableCreateService.java` | 封装建表 + 文件创建逻辑 |
| `TableFileLocator.java` 或新建 `TableFileCreator.java` | 空文件创建能力 |

### 4.2 前端设计

#### 4.2.1 建表表单组件

新增 `CreateTableForm` 组件（Modal 形式），包含：

- **类型选择**：table / struct / enum（Radio）
- **表名**：输入框（标识符校验）
- **数据文件名**：输入框（table 专属，如 equip.xlsx）
- **主键**：字段选择器（table 专属）
- **字段列表**：可增删的动态表单
  - 字段名、类型（下拉：int/long/float/bool/str/自定义 struct 引用）
  - 可选标记（optional）
  - 外键配置（引用表 + 引用类型）
- **预览**：实时生成 CFG 文本预览
- **保存**：调 `/createTable`，成功后关闭 Modal + 刷新 schema

#### 4.2.2 入口位置

- HeaderBar 新增"新建表"按钮（与"CFG 编辑器"并列）
- 空状态引导页（阶段 1 的 EmptySchemaGuide）的"新建表"按钮也指向此表单

#### 4.2.3 涉及前端文件

| 文件 | 改动 |
|------|------|
| 新建 `cfgeditor/src/features/schema/CreateTableForm.tsx` | 建表表单 |
| `cfgeditor/src/api/apiClient.ts` | 新增 `createTable()` 和 `createDataFile()` |
| `cfgeditor/src/features/headerbar/HeaderBar.tsx` | 新增"新建表"按钮 |
| `cfgeditor/src/app/CfgEditorApp.tsx` | EmptySchemaGuide 按钮联动 |
| `cfgeditor/src/app/i18n.ts` | 新增翻译键 |

### 4.3 测试

- 后端：JUnit 测试 `TableCreateService` — 创建各种类型的表、文件创建、重复校验
- 前端：手动测试建表流程 → config.cfg 更新 → 空数据文件生成 → 编辑器显示新表

---

## 5. 通用设计决策

### 5.1 后端端点命名与风格

遵循现有约定：
- GET 端点：读取数据（`/schemas`, `/notes`, `/search` ...）
- POST 端点：写入操作（`/recordAddOrUpdate`, `/recordDelete`, `/noteUpdate` ...）
- 新增端点风格一致：`/schemaText`(GET)、`/schemaWrite`(POST)、`/createTable`(POST)、`/createDataFile`(POST)
- 所有 POST 端点走 `checkPostMethod` 校验 + CORS 预检
- 写操作走 `synchronized` 临界区

### 5.2 前端分层遵守

```
features/schema/  (新建)
  ├── SchemaTextEditor.tsx     (阶段 2)
  └── CreateTableForm.tsx       (阶段 3)
       ↓ 依赖
api/apiClient.ts               (新增 API 函数)
       ↓ 依赖
api/schemaModel.ts             (可能新增类型)
```

不违反 `features → store/services → domain → api` 单向依赖。

### 5.3 Docker nginx 配置更新

新增 4 个 API 路径需在 nginx 反代配置中添加：
```
location ~ ^/(schemas|notes|noteUpdate|search|prompt|checkJson|recordRefIds|record|recordAddOrUpdate|recordDelete|schemaText|schemaWrite|createTable|createDataFile) {
    proxy_pass http://127.0.0.1:3456;
    ...
}
```

### 5.4 Watch 机制与写回的交互

当前 watch 机制（`WatchAndPostRun`）监听文件变化触发 reload。schema 写回会修改 config.cfg，可能触发 watch 事件。需要：
- 利用现有的 `lastLoadDidAutoFix` 机制：写回后标记，watch 层检测到自触发时跳过
- 或者写回后直接调用 `initFromCtx`，不等 watch 触发

### 5.5 i18n 键命名

```ts
// 阶段 1
emptySchemaTitle: '当前数据目录没有配置表' / 'No tables in data directory'
emptySchemaDesc: 'config.cfg 文件为空或不存在' / 'config.cfg is empty or missing'
emptySchemaTip: '你可以通过以下方式创建配置表' / 'You can create tables via'

// 阶段 2
cfgEditor: 'CFG 编辑器' / 'CFG Editor'
cfgEditorSave: '保存' / 'Save'
cfgEditorSaved: '已保存，正在刷新...' / 'Saved, refreshing...'
cfgEditorError: '语法错误' / 'Syntax Error'

// 阶段 3
createTable: '新建表' / 'Create Table'
createTableType: '类型' / 'Type'
createTableName: '表名' / 'Table Name'
// ...
```

---

## 6. 交付计划

| 阶段 | 内容 | 改动范围 | 预估工作量 |
|------|------|----------|-----------|
| 1 | 空数据引导提示 | 纯前端 2 文件 | 小 |
| 2 | CFG 文本编辑器 | 前端 4 文件 + 后端 2 文件 | 中 |
| 3 | 可视化建表 + 新建数据文件 | 前端 5 文件 + 后端 3 文件 | 大 |

每阶段完成后：
1. 后端 `./gradlew.bat test` 通过
2. 前端 `pnpm run lint && pnpm test:run` 通过
3. 手动验证功能正常
4. Git commit

---

## 7. 风险与注意事项

1. **CFG 语法解析的容错**：阶段 2 用户可能输入语法错误的 CFG 文本，后端解析需返回精确的行号和错误信息。`CfgReader` 的错误收集机制（`CfgSchemaErrs`）需要检查是否提供行号。
2. **并发安全**：所有写操作必须走 `synchronized` 临界区，与现有 `editRecord` 一致。
3. **Docker 部署兼容**：新增端点需同步更新 nginx 配置，否则 Docker 部署下新功能不可用。
4. **watch 写-触发循环**：写回 config.cfg 后 watch 可能再次触发 reload，需利用 `lastLoadDidAutoFix` 标志避免循环。
5. **CodeMirror/Monaco 依赖体积**：优先选择轻量编辑器组件，避免前端包体积膨胀过多。可考虑先用 `<textarea>` + 语法高亮库的轻量方案。
6. **表结构修改 vs 创建**：阶段 3 只做"创建新表"，不涉及"修改已有表结构"。修改已有表结构（加减字段、改类型）复杂度高（需迁移已有数据），留作后续需求。
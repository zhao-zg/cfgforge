---
AIGC:
  ContentProducer: '001191110102MAD55U9H0F10002'
  ContentPropagator: '001191110102MAD55U9H0F10002'
  Label: '1'
  ProduceID: '16a5857b-258c-41c3-8b8a-59086856dc5e'
  PropagateID: '16a5857b-258c-41c3-8b8a-59086856dc5e'
  ReservedCode1: '0b919473-4aac-405a-8abb-f19f6b011a28'
  ReservedCode2: '0b919473-4aac-405a-8abb-f19f6b011a28'
---

# 整表导出 CSV + SQL 设计

> AI生成

## 目标

为 cfgeditor 新增"整表导出"能力：在 ToolsSetting 面板加两个按钮，一键将当前定位的表导出为 CSV 或 SQL 文件。

## 背景

cfgeditor 已有 PNG 导出（画布截图）和 `_res.csv`（资源汇总），但没有把整张配表的数据导出为通用格式的能力。配表数据存储在 `CfgValue.vTableMap` 中，每张表有 `primaryKeyMap`（主键→VStruct），可遍历获取所有记录。

## 架构

```
ToolsSetting 按钮
  → apiClient.exportTable(tableId, format)
    → ExportService（新建，editor-core 层）
      → 从 cfgValue.vTableMap 取 VTable
      → 遍历 primaryKeyMap 的每个 VStruct
      → 用 ValueToJson 转换为 JSON 对象
      → 从 TableSchema 取字段名列表
      → CSV: 列头行 + 数据行（嵌套值 JSON 序列化）
      → SQL: CREATE TABLE + INSERT INTO 语句
    → 返回字符串
  → file-saver saveAs(Blob, filename)
```

## 组件与职责

| 层 | 文件 | 职责 |
|---|---|---|
| editor-core | `packages/editor-core/src/ExportService.ts` | 遍历表记录、生成 CSV/SQL 字符串 |
| editor-core | `packages/editor-core/src/index.ts` | 导出新 service + 类型 |
| cfgeditor api | `cfgeditor/src/api/apiClient.ts` | 加 `exportTable()` 函数 |
| cfgeditor UI | `cfgeditor/src/features/setting/ToolsSetting.tsx` | 加导出按钮（CSV + SQL） |
| cfgeditor i18n | `cfgeditor/src/app/i18n.ts` | 加翻译 key |

## 数据流

1. 用户在 ToolsSetting 面板点"导出 CSV"或"导出 SQL"
2. `apiClient.exportTable(curTableId, 'csv' | 'sql')` 调用 `ExportService.exportTable(editor, tableId, format)`
3. ExportService 从 `editor.cfgValue().vTableMap` 取 `VTable`
4. 从 `VTable.schema`（TableSchema）取字段名列表
5. 遍历 `vTable.primaryKeyMap`，每个 `VStruct` 用 `ValueToJson` 转 JSON 对象
6. 按 format 生成字符串：
   - **CSV**：列头行 + 数据行
   - **SQL**：CREATE TABLE + 批量 INSERT
7. 返回 `{resultCode: 'ok', content: string}` 或错误码
8. cfgeditor 用 `file-saver` 的 `saveAs(new Blob([content]), filename)` 保存

## CSV 格式

- **BOM 头**：`\uFEFF`（UTF-8 BOM，保证 Excel 正确识别中文）
- **列头**：TableSchema 字段名列表（按 schema 字段顺序，主键优先）
- **数据行**：每条记录一行
- **值序列化**：
  - 标量（int/string/bool）→ 原始值
  - 对象/数组 → `JSON.stringify` 后的字符串
- **CSV 转义**：值含逗号、引号或换行 → 双引号包裹，内部引号 `""` 转义
- **文件名**：`{tableName}.csv`

## SQL 格式

- **表名**：`cfg_` + 驼峰名拆分小写下划线（如 `HeroRecruitList` → `cfg_hero_recruit_list`）
- **CREATE TABLE**：`CREATE TABLE IF NOT EXISTS "cfg_xxx" ("field1" TYPE, ...)`
- **字段类型推导**（从 SField.type）：
  - int/long → `INTEGER`
  - string → `TEXT`
  - bool → `INTEGER`
  - list/struct/interface → `TEXT`（存 JSON 字符串）
- **INSERT INTO**：每条记录一行
  - `INSERT INTO "cfg_xxx" VALUES (val1, val2, ...)`
  - 字符串值用单引号包裹，内部单引号 `''` 转义
  - 嵌套值 `JSON.stringify` 后作为字符串存入
- **文件名**：`{tableName}.sql`

## 驼峰转下划线规则

```
HeroRecruitList → hero_recruit_list
A2024Christmas   → a2024_christmas
AiNpcCityAttack  → ai_npc_city_attack
```

算法：在大小写边界和字母-数字边界插入下划线，全转小写。

## 错误处理

- 表不存在 → `{resultCode: 'tableNotFound'}`
- 空表（无记录）→ CSV 只有列头行；SQL 只有 CREATE TABLE
- 导出异常 → notification.error 提示

## 测试策略

ExportService 纯逻辑测试（vitest，喂 fixture，不碰 UI/Tauri IPC）：
- CSV 列头正确、数据行正确
- 嵌套值 JSON 序列化正确
- CSV 转义（逗号、引号、换行）
- SQL 表名驼峰转下划线正确
- SQL INSERT 语句正确
- SQL 字段类型推导正确
- 空表导出
- 表不存在错误处理

## 不做（YAGNI）

- 不做整表导入
- 不做 Excel 格式
- 不做批量多表导出
- 不碰现有 UI 布局结构

> AI生成
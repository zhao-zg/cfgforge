---
AIGC:
  ContentProducer: '001191110102MAD55U9H0F10002'
  ContentPropagator: '001191110102MAD55U9H0F10002'
  Label: '1'
  ProduceID: '842e9734-884a-4fd8-b050-fff8595dc362'
  PropagateID: '842e9734-884a-4fd8-b050-fff8595dc362'
  ReservedCode1: 'dba99046-b7a0-4336-8847-a03acc7fd495'
  ReservedCode2: 'dba99046-b7a0-4336-8847-a03acc7fd495'
---

[(English Documents Available)](README_EN.md)


# 📊 策划配表系统

![intro](docs/src/content/docs/intro.png)

一个对象数据库浏览器、编辑器、程序访问代码生成器

1. 📋 定义对象结构
2. 🎨 使用excel编辑、或使用基于节点的界面来编辑和浏览所有对象。
3. 💻 生成访问代码


## ✨ 主要功能

* 🏗️ 支持多态结构，嵌套结构
* 🔗 通过配置外键，检测数据一致性
* 💻 通过生成代码，使程序方便访问类型化数据，生成外键引用，生成entry、enum（让程序中没有魔数），支持java、c#、lua、go、typescript
* 📊 结构数据可以在excel中配置，也可以json中配置，提供基于节点的界面来编辑和浏览。
* ⚡ 生成java注重热更新的安全，生成lua注重内存大小

## 📚 Documentation

请阅读[详细文档](https://stallboy.github.io/cfgforge)

## 🚀 快速开始

### 🗂️ 配表系统 cfgforge

请参考 [配置系统文档](packages/cli/README.md)。

### 🎨 编辑器 cfgeditor.exe

请参考 [编辑器 cfgeditor 文档](cfgeditor/README.md)


### 开发工具


请参考 [CFG claudecode插件和vscode插件](cfgdev/README.md)。

> AI生成
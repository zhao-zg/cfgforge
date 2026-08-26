---
AIGC:
  ContentProducer: '001191110102MAD55U9H0F10002'
  ContentPropagator: '001191110102MAD55U9H0F10002'
  Label: '1'
  ProduceID: 'dfcc14b3-a236-4f21-8060-5ebf77236c58'
  PropagateID: 'dfcc14b3-a236-4f21-8060-5ebf77236c58'
  ReservedCode1: 'f0af2119-ff62-409f-8cc7-be5576e00664'
  ReservedCode2: 'f0af2119-ff62-409f-8cc7-be5576e00664'
---

[(English Documents Available)](README_EN.md)

# 🎨 编辑器 cfgeditor

1. 👁️ 可视化浏览表结构和记录
2. ✏️ 编辑记录

## 快速构建

1. Prerequisites: nodejs, pnpm, rust
2. `pnpm config set --global registry https://registry.npmmirror.com/`
3. `pnpm install`
4. `genexe.bat`


## 开发期间

- 启动调试

    ```bash
    pnpm run dev
    ```

    使用浏览器查看 http://localhost:1420/


### 发布html

```bash
pnpm run build
```

生成的页面和脚本在`dist`目录，可以运行

```bash
cd dist
jwebserver
```

来启动服务器进行测试，然后使用浏览器查看 http://localhost:8000/
实际部署请选择更成熟的web服务器。

> AI生成
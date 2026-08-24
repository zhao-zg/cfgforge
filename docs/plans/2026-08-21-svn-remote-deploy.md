---
AIGC:
  ContentProducer: '001191110102MAD55U9H0F10002'
  ContentPropagator: '001191110102MAD55U9H0F10002'
  Label: '1'
  ProduceID: 'd2f495dc-b3cb-489d-a448-074f7798adc8'
  PropagateID: 'd2f495dc-b3cb-489d-a448-074f7798adc8'
  ReservedCode1: 'a9baa5c8-41ca-4f41-95f7-06a27e69feba'
  ReservedCode2: 'a9baa5c8-41ca-4f41-95f7-06a27e69feba'
---

# SVN 工作副本 + 远程 Docker 部署方案

> 日期：2026-08-21
> 目标：让 cfggen 后端跑在远程 Docker 容器中，而配表数据（Excel/CSV/CFG）通过 SVN 版本管理，本机编辑提交、远程自动生效。
> 关联：[Docker 镜像构建与 GitHub Actions CI 计划](./2026-08-21-docker-image.md)

## 架构与数据流

```
本机（编辑侧）                      远程服务器（运行侧）
┌─────────────────────┐   svn    ┌──────────────────────────────┐
│ SVN 工作副本          │  commit  │ SVN 工作副本 /opt/cfggen-data │
│ Excel/CSV/CFG 编辑   ├─────────►│  (svn update 保持最新)         │
└─────────────────────┘          │            │ volume 挂载       │
                                 │            ▼                  │
                                 │   ┌──────────────────┐        │
                                 │   │ Docker 容器        │        │
                                 │   │ /data ← 挂载       │        │
                                 │   │  Nginx + cfggen.jar│        │
                                 │   └──────────────────┘        │
                                 └──────────────────────────────┘
浏览器（前端 cfgeditor）──► http://远程IP:8080（Nginx 反代 / → 静态，/schemas、/record 等 → Java:3456）
```

**核心事实**：Docker volume 挂载的是**远程服务器上的目录**。本机的 SVN 工作副本无法直接挂进远程容器，必须由远程服务器 `svn checkout/update` 一份副本，再挂载该副本进容器。

## 前置准备

1. 远程服务器已安装 Docker + Docker Compose（compose v2）。
2. 远程服务器可访问 SVN 仓库（`svn` CLI 已安装，或可用 `svn+ssh`/`http` 免密认证）。
3. 配表数据（`config.cfg`、Excel/CSV 等）已纳入 SVN 版本管理，仓库结构为：

```
<svn 仓库根>/
└── config/            # 即 -datadir 指向的目录，须含 config.cfg
    ├── config.cfg
    ├── Excel/ 或表文件...
    └── ...
```

> 说明：SVN 仓库根下可以不止 config 一个目录；`svn checkout` 时可以只检出 config 目录，减小传输。

## 一、远程服务器：检出 SVN 工作副本

```bash
# 1. 创建数据目录
sudo mkdir -p /opt/cfggen-data

# 2. 检出（只检配置目录；若 SVN 仓库根就是 config，则直接检出根）
svn checkout https://svn.example.com/repo/config /opt/cfggen-data
```

> 若已在别处有工作副本，也可 `svn checkout` 或 `svn export`。`export` 不含 `.svn` 元数据，可避免 watcher 干扰（见下文「watch 与 SVN 的注意」），但不能 `svn update` 增量更新，只能重新 export。

## 二、远程服务器：编排 docker-compose

在远程服务器新建 `docker-compose.yml`：

```yaml
services:
  cfggen:
    image: ghcr.io/zhao-zg/cfggen:0.0.1
    ports:
      - "8080:80"
    volumes:
      # 挂载 SVN 工作副本（须含 config.cfg 等配表文件）
      - /opt/cfggen-data:/data
    environment:
      - JAVA_PORT=3456
      - DATADIR=/data
    restart: unless-stopped
```

> 端口如需改（如 80），改 `"8080:80"` 左侧即可。前端 `server` 配置留空（跟随页面域名），或直接填 `远程IP:8080`。

启动：

```bash
docker compose up -d
docker compose ps
```

验证：

```bash
curl http://127.0.0.1:8080/schemas        # 应返回 JSON schema
curl -I http://127.0.0.1:8080/            # 应返回前端 HTML
```

## 三、本机编辑 → 远程生效（两种方式）

### 方式 A：手动（推荐起步）

1. 本机编辑 Excel/CSV 后 `svn commit`。
2. 远程服务器执行：

```bash
cd /opt/cfggen-data
svn update
docker compose restart        # 使容器重新加载新数据
```

### 方式 B：远程定时自动同步（推荐长期）

在远程服务器配置 cron，每 N 分钟自动 update + 重启：

```bash
# /etc/cron.d/cfggen-sync
*/5 * * * * root /opt/scripts/cfggen-sync.sh >> /var/log/cfggen-sync.log 2>&1
```

脚本 `/opt/scripts/cfggen-sync.sh`：

```bash
#!/bin/bash
set -euo pipefail

cd /opt/cfggen-data
if svn update | grep -qE '^[UAGERC]'; then
    # 有更新才重启容器
    cd /opt/cfggen-deploy
    docker compose restart cfggen
fi
```

> 说明：`svn update | grep` 判断是否有变更（U=更新 A=新增 G=合并 E=已存在 R=替换 C=冲突），`^[UAGERC]` 匹配首列状态符。有变更才重启，避免无谓重启。
>
> **注意**：若出现 `C`（冲突），本脚本仍会重启容器。若希望冲突时不生效（避免加载冲突标记文件），可先 `svn update --accept postpone` 并人工处理，或改用 `grep -qE '^[UAGER]'`（排除冲突才重启）——但那样冲突时会一直不更新，需人工介入。配表目录冲突概率低，按需取舍。

给脚本执行权限：`sudo chmod +x /opt/scripts/cfggen-sync.sh`

## 四、前端如何连接

- **本地浏览器 + 远程后端**：cfgeditor 的 server 填 `远程IP:8080`（或 `http://远程IP:8080`），其余留空。cfgeditor 前端对 CORS 支持已内置（后端有 alloworigin 参数，但 Docker 方案里前端与后端同源反代，无需额外配置）。
- **Docker 部署**：server 留空（走同源相对路径）。

## 五、可选增强：watch 热加载

后端支持 `watch=<秒>` 参数，监听数据目录变化自动 reload，无需重启容器。当前镜像 entrypoint **未传该参数**。若想用：

1. 修改 `.docker/entrypoint.sh`，在 Java 启动命令追加 `,watch=3`；
2. 重新构建镜像并推送（涉及 CI）；
3. `docker compose up -d` 重建容器。

**注意（重要）**：SVN 工作副本内的 `.svn` 元数据目录**不被 Watcher 忽略**（`DataUtil.isFileIgnored` 只忽略隐藏文件与 `~` 开头文件）。`svn update` 会写入 `.svn`，可能触发不必要的 reload 事件。因此：
- 若开启 watch，建议 **SVN 使用 `svn export` 部署**（无 `.svn` 目录），另建目录做 update 再同步，或接受轻微误触发（watch 有防抖 `waitSecondsAfterWatchEvt`）。
- 默认（不开启 watch）不受此问题影响。

## 六、回滚与排错

- **回滚数据**：`svn update -r <版本号>` 或 `svn merge -r` 回退，再重启容器。
- **容器起不来**：`docker compose logs cfggen` 查看 Java 是否报错（如 `config.cfg` 缺失、编码错误）。
- **前端 404 / 白屏**：确认 `server` 留空或填对端口；`curl http://远程IP:8080/schemas` 是否通（nginx 按无前缀路径精确反代到 Java）。
- **CORS 报错**：前端通过 `http://远程IP:8080` 访问时与 Java 同源（Nginx 反代），不会跨域；只有前端单独部署在其他域名时才需 alloworigin。

## 约束与不变量

- 不修改现有 `app/` 与 `cfgeditor/` 源码（本方案只涉及部署配置与脚本）。
- 数据目录与容器 volume 解耦：数据变更只重启容器即可生效，无需重新构建镜像。
- 所有远程侧文件建议放 `/opt/cfggen-deploy`（compose 所在）与 `/opt/scripts`（脚本），保持部署与数据分离。
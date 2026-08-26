---
AIGC:
  ContentProducer: '001191110102MAD55U9H0F10002'
  ContentPropagator: '001191110102MAD55U9H0F10002'
  Label: '1'
  ProduceID: '918914b8-3418-42ba-b9e6-ebad6e2a817d'
  PropagateID: '918914b8-3418-42ba-b9e6-ebad6e2a817d'
  ReservedCode1: 'dfcca684-e709-475e-9e8f-e5cf012114c0'
  ReservedCode2: 'dfcca684-e709-475e-9e8f-e5cf012114c0'
---

# Docker 镜像构建与 GitHub Actions CI 计划

> 日期：2026-08-21
> 目标：为 cfgforge 项目添加 Docker 镜像（后端 jar + 前端 dist + Nginx 一体化），并通过 GitHub Actions 自动构建推送到 GHCR。

## 架构

```
浏览器 → Nginx (:80)
                ├── /          → 静态文件 (cfgeditor/dist)
                └── /api/*     → 反代到 Java (:3456, bind=0.0.0.0)
```

容器内两个进程：Nginx（前端 + 反代）、Java（cfgforge.jar -gen server）。
entrypoint.sh 用 Nginx 前台运行 + Java 后台运行的方式管理进程。

## 新增文件

| # | 文件 | 说明 |
|---|---|---|
| 1 | `.dockerignore` | 排除 .git、node_modules、build 产物等 |
| 2 | `.docker/nginx.conf` | Nginx 配置：静态文件 + API 反代 |
| 3 | `.docker/entrypoint.sh` | 启动脚本：拉起 Java 后端 + Nginx 前台 |
| 4 | `Dockerfile` | 多阶段构建（3 阶段） |
| 5 | `docker-compose.yml` | 本地运行编排 |
| 6 | `.github/workflows/docker.yml` | CI 构建推送镜像 |

## Task 分解

### Task 1: .dockerignore

排除不必要文件减小构建上下文：
- `.git`、`node_modules`、`dist`、`build`、`.gradle`
- `*.jar`、`*.exe`、`cfgeditor/src-tauri/target`
- `docs/node_modules`、`example/*/node_modules`

### Task 2: .docker/nginx.conf

- 监听 80 端口
- `location /` → root `/app/web`，try_files 回退 index.html（SPA 路由）
- `location /api/` → `proxy_pass http://127.0.0.1:3456/`，去掉 `/api` 前缀
- proxy header 透传 Host、X-Real-IP 等

### Task 3: .docker/entrypoint.sh

- 启动 Java 后端：`java -jar /app/cfgforge.jar -datadir /data -gen server,bind=0.0.0.0,port=3456` &
- 等待 Java 就绪（轮询 3456 端口）
- Nginx 前台运行：`nginx -g 'daemon off;'`

### Task 4: Dockerfile（多阶段构建）

**Stage 1: builder-jar** — JDK 25 + Gradle fatJar
- 基础镜像：`eclipse-temurin:25-jdk`
- COPY app/ → /build/app/
- RUN `./gradlew.bat fatJar --no-daemon`
- 产出：`/build/app/build/libs/cfgforge.jar`

**Stage 2: builder-web** — Node 24 + pnpm build
- 基础镜像：`node:24-alpine`
- COPY cfgeditor/ → /build/cfgeditor/
- RUN `npm install -g pnpm && pnpm install --frozen-lockfile && pnpm build`
- 产出：`/build/cfgeditor/dist/`

**Stage 3: runtime** — Nginx + JRE
- 基础镜像：`eclipse-temurin:25-jre`
- 安装 nginx
- COPY --from=builder-jar cfgforge.jar → /app/cfgforge.jar
- COPY --from=builder-web dist → /app/web
- COPY .docker/nginx.conf → /etc/nginx/nginx.conf
- COPY .docker/entrypoint.sh → /app/entrypoint.sh
- VOLUME /data
- EXPOSE 80
- ENTRYPOINT ["/app/entrypoint.sh"]

### Task 5: docker-compose.yml

```yaml
services:
  cfgforge:
    image: ghcr.io/${OWNER}/cfgforge:latest
    ports:
      - "8080:80"
    volumes:
      - ./example/config:/data
    restart: unless-stopped
```

### Task 6: .github/workflows/docker.yml

- 触发：push tag v* + push master
- 权限：packages: write
- 步骤：
  1. checkout
  2. docker/setup-qemu-action
  3. docker/setup-buildx-action
  4. docker/login-action (ghcr.io, ${{ github.token }})
  5. docker/build-push-action:
     - context: .
     - tags: |
         ghcr.io/${{ github.repository_owner }}/cfgforge:latest  (master)
         ghcr.io/${{ github.repository_owner }}/cfgforge:${{ github.ref_name }}  (tag)
     - cache-from: type=gha
     - cache-to: type=gha,mode=max

### Task 7: 验证

- Dockerfile 语法检查（hadolint 如可用，否则手动审查）
- GitHub Actions YAML 语法检查
- 确认 .dockerignore 覆盖所有大目录
- 确认 entrypoint.sh 可执行权限（CI 中 chmod）
- 确认 nginx.conf 路径与 Dockerfile COPY 一致

## 约束

- 不修改现有 app/ 和 cfgeditor/ 源码
- 不修改现有 release.yml 和 pages.yml
- 所有新文件放项目根目录或 .docker/ 子目录
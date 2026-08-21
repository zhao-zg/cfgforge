# ============================================================
# Stage 1: 构建 Java fatJar
# ============================================================
FROM eclipse-temurin:25-jdk AS builder-jar

WORKDIR /build

# 先复制 Gradle wrapper 和构建脚本，利用缓存层
COPY app/gradlew app/gradlew.bat ./
COPY app/gradle ./gradle
COPY app/build.gradle app/settings.gradle ./

# 复制源码
COPY app/src ./src

# 构建 fatJar
RUN chmod +x gradlew && ./gradlew fatJar --no-daemon

# ============================================================
# Stage 2: 构建前端静态文件
# ============================================================
FROM node:24-alpine AS builder-web

WORKDIR /build

# 先复制依赖文件利用缓存层
COPY cfgeditor/package.json cfgeditor/pnpm-lock.yaml cfgeditor/pnpm-workspace.yaml ./

# 安装 pnpm 并装依赖
RUN npm install -g pnpm@9 && pnpm install --frozen-lockfile

# 复制源码并构建
COPY cfgeditor/tsconfig.json cfgeditor/vite.config.ts ./
COPY cfgeditor/index.html ./
COPY cfgeditor/src ./src
COPY cfgeditor/public ./public

RUN pnpm build

# ============================================================
# Stage 3: 运行时镜像（Nginx + JRE）
# ============================================================
FROM eclipse-temurin:25-jre

# 安装 Nginx
RUN apt-get update && \
    apt-get install -y --no-install-recommends nginx wget && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 复制构建产物
COPY --from=builder-jar /build/build/libs/cfggen.jar /app/cfggen.jar
COPY --from=builder-web /build/dist /app/web

# 复制配置文件
COPY .docker/nginx.conf /etc/nginx/nginx.conf
COPY .docker/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# 数据目录（配置文件挂载点）
VOLUME /data

# Nginx 对外暴露 80 端口
EXPOSE 80

ENTRYPOINT ["/app/entrypoint.sh"]

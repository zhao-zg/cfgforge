# ============================================================
# Stage 1: Build monorepo packages + cfgeditor frontend
# ============================================================
FROM node:24-alpine AS builder

WORKDIR /build

# Copy monorepo config files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages ./packages
COPY cfgeditor/package.json cfgeditor/pnpm-lock.yaml cfgeditor/tsconfig.json cfgeditor/tsconfig.node.json cfgeditor/vite.config.ts cfgeditor/index.html ./cfgeditor/
COPY cfgeditor/src ./cfgeditor/src
COPY cfgeditor/public ./cfgeditor/public

# Install pnpm and build all packages
RUN npm install -g pnpm@9 && pnpm install --frozen-lockfile
RUN pnpm -r run build

# Build cfgeditor frontend
RUN cd cfgeditor && pnpm build

# ============================================================
# Stage 2: Runtime image (Node HTTP server)
# ============================================================
FROM node:24-alpine

# Copy built frontend
COPY --from=builder /build/cfgeditor/dist /app/web

# Copy server script
COPY server/server.mjs /app/server/server.mjs

WORKDIR /app

# Environment defaults
ENV CFGFORGE_DATA_DIR=/data
ENV CFGFORGE_WEB_ROOT=/app/web
ENV CFGFORGE_PORT=80
ENV CFGFORGE_HOST=0.0.0.0

EXPOSE 80

# Zero-dependency Node server: serves SPA + /api/fs/* REST API
CMD ["node", "server/server.mjs"]

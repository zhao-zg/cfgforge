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
# Stage 2: Runtime image (Nginx only — serves static files)
# ============================================================
FROM nginx:alpine

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Copy custom nginx config
COPY .docker/nginx.conf /etc/nginx/nginx.conf

# Copy built frontend
COPY --from=builder /build/cfgeditor/dist /app/web

WORKDIR /app

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

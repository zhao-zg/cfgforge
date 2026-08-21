#!/bin/sh
set -e

DATADIR="${DATADIR:-/data}"
PORT="${JAVA_PORT:-3456}"

echo "[entrypoint] Starting cfggen server on 0.0.0.0:${PORT} with datadir=${DATADIR}"
java -jar /app/cfggen.jar -datadir "${DATADIR}" -gen "server,bind=0.0.0.0,port=${PORT}" &

# 等待 Java 后端就绪
echo "[entrypoint] Waiting for Java backend to be ready..."
for i in $(seq 1 30); do
    if wget -q -O- "http://127.0.0.1:${PORT}/schemas" >/dev/null 2>&1; then
        echo "[entrypoint] Java backend is ready."
        break
    fi
    echo "[entrypoint]   ...waiting (${i}/30)"
    sleep 1
done

# Nginx 前台运行
echo "[entrypoint] Starting Nginx..."
exec nginx -g 'daemon off;'

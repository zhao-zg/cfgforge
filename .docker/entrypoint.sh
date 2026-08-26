#!/bin/sh
set -e

echo "[entrypoint] Starting Nginx (static file server)..."
exec nginx -g 'daemon off;'

/**
 * cfgforge Web 版后端（零依赖 Node HTTP 服务）。
 *
 * 职责：
 * 1. 托管 cfgeditor 前端静态构建产物（cfgeditor/dist），SPA fallback 到 index.html。
 * 2. 提供文件系统 REST API（/api/fs/*），供前端 BrowserHttpFileSystem 调用，
 *    读写挂载的数据目录（环境变量 CFGFORGE_DATA_DIR）。
 *
 * 安全约束：
 * - 所有路径操作限制在数据根目录内（防止路径穿越到容器其他位置）。
 * - 只暴露一组有限的、与 CfgFileSystem 接口一一对应的操作。
 *
 * 与 Tauri 桌面版的差异：
 * - Tauri 直接读写本机文件系统；本服务是 Docker 网页版的文件访问后端，
 *   数据目录通过 volume 挂载进容器（CFGFORGE_DATA_DIR）。
 */

import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// 配置
// ---------------------------------------------------------------------------

const DATA_ROOT = path.resolve(process.env.CFGFORGE_DATA_DIR || '/data');
const WEB_ROOT = path.resolve(process.env.CFGFORGE_WEB_ROOT || path.join(__dirname, '..', 'cfgeditor', 'dist'));
const PORT = parseInt(process.env.CFGFORGE_PORT || '80', 10);
const HOST = process.env.CFGFORGE_HOST || '0.0.0.0';

// HTTPS 配置：启用后浏览器视为安全上下文，showDirectoryPicker 等 API 可用
const USE_HTTPS = process.env.CFGFORGE_HTTPS === '1' || process.env.CFGFORGE_HTTPS === 'true';
const CERT_DIR = process.env.CFGFORGE_CERT_DIR || path.join(__dirname, 'certs');
const CERT_FILE = path.join(CERT_DIR, 'cert.pem');
const KEY_FILE = path.join(CERT_DIR, 'key.pem');

// ---------------------------------------------------------------------------
// 自签证书自动生成
// ---------------------------------------------------------------------------

/**
 * 启动时自动生成自签证书（如不存在）。
 * 优先用 Node 内置 crypto 生成；如果失败（旧版 Node 无 generateKeyPairSync 签名能力），
 * 则尝试调用系统 openssl。
 *
 * 证书包含 SAN（Subject Alternative Names），覆盖：
 * - localhost
 * - 0.0.0.0
 * - 127.0.0.1
 * - 容器 hostname
 * 用户通过 https://局域网IP 访问时 Chrome 会警告证书不受信任，
 * 点击「高级 → 继续前往」即可。
 */
async function ensureSelfSignedCert() {
  // 已存在则直接复用
  if (fs.existsSync(CERT_FILE) && fs.existsSync(KEY_FILE)) {
    console.log(`[cfgforge-server] reusing existing cert: ${CERT_FILE}`);
    return { cert: fs.readFileSync(CERT_FILE), key: fs.readFileSync(KEY_FILE) };
  }

  await fsp.mkdir(CERT_DIR, { recursive: true });

  // 尝试用 openssl CLI 生成（Docker 镜像中安装了 openssl）
  try {
    const subj = '/CN=cfgforge-self-signed';
    execSync(
      `openssl req -x509 -newkey rsa:2048 -keyout "${KEY_FILE}" -out "${CERT_FILE}" ` +
      `-days 825 -nodes -subj "${subj}" ` +
      `-addext "subjectAltName=IP:0.0.0.0,IP:127.0.0.1,DNS:localhost,IP:::1"`,
      { stdio: 'pipe', timeout: 15000 }
    );
    console.log(`[cfgforge-server] self-signed cert generated via openssl: ${CERT_FILE}`);
    return { cert: fs.readFileSync(CERT_FILE), key: fs.readFileSync(KEY_FILE) };
  } catch (e) {
    // openssl 不可用时尝试 Node crypto
    console.warn(`[cfgforge-server] openssl not available (${e.message}), trying Node crypto...`);
  }

  // Node crypto 兜底（Node 16+）
  try {
    const { generateKeyPairSync } = await import('node:crypto');
    const { privateKey, publicKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
    });

    // 构建自签证书（使用 X509Certificate）
    const { X509Certificate } = await import('node:crypto');
    // Node 的 crypto 模块不直接提供创建 X509 证书的简单 API，
    // 兜底失败时给出明确错误信息
    throw new Error('Node crypto cert generation not implemented, openssl required');
  } catch (e) {
    throw new Error(
      `Failed to generate self-signed certificate. ` +
      `Please install openssl in the container, or provide your own cert files at:\n` +
      `  ${CERT_FILE}\n  ${KEY_FILE}\n` +
      `Original error: ${e.message}`
    );
  }
}

// ---------------------------------------------------------------------------
// 路径安全：把绝对路径映射到 DATA_ROOT 内的相对路径
// ---------------------------------------------------------------------------

/**
 * 把前端传入的路径转为 DATA_ROOT 内的绝对路径。
 * 前端可能传：
 *  - Docker 绝对路径：/data/sub/file.xlsx（Docker 容器内 DATA_ROOT 就是 /data）
 *  - 相对路径：sub/file.xlsx
 *  - Windows 绝对路径：G:\test-data\sub\file.xlsx（本地测试）
 *
 * 策略：
 *  1. 统一替换 \ 为 /，便于字符串匹配
 *  2. 如果路径以 DATA_ROOT（统一 / 后）开头 → 去掉前缀，使用相对部分
 *  3. 否则去掉前导 / 或 drive letter，当作相对路径
 *  4. 最终 path.join(DATA_ROOT, relPart)，并验证在 DATA_ROOT 内
 */
function toAbs(p) {
  // 统一为正斜杠
  const norm = p.replace(/\\/g, '/');
  // rootNorm 也去掉 drive letter 和前导 /，与 rel 的处理保持一致
  const rootNorm = DATA_ROOT.replace(/\\/g, '/').replace(/^([A-Za-z]:)/, '').replace(/^\/+/, '');

  // 去掉前导 drive letter 和/或前导 /
  let rel = norm;
  // 去掉 Windows drive letter（如 C:）
  rel = rel.replace(/^([A-Za-z]:)/, '');
  // 去掉前导 /
  rel = rel.replace(/^\/+/, '');

  // 如果去掉前缀后以 DATA_ROOT 路径开头（如 "data/xxx" 或 "test-data/xxx"），去掉 DATA_ROOT 前缀
  if (rel === rootNorm) {
    rel = '';
  } else if (rel.startsWith(rootNorm + '/')) {
    rel = rel.substring(rootNorm.length + 1);
  } else {
    // basename 匹配：Docker 中 DATA_ROOT=/data，用户传 /data/xxx → rel="data/xxx"
    // rootNorm 是完整路径（如 "G:/.../test-data"），但 basename "test-data" 或 "data" 可能匹配
    const rootBasename = path.basename(DATA_ROOT).toLowerCase();
    if (rel.toLowerCase() === rootBasename) {
      rel = '';
    } else {
      const bp = rootBasename + '/';
      if (rel.toLowerCase().startsWith(bp)) {
        rel = rel.substring(rootBasename.length + 1);
      }
    }
  }

  // 路径安全检查：不允许 ..
  const finalPath = path.join(DATA_ROOT, rel);
  const finalRel = path.relative(DATA_ROOT, finalPath);
  if (finalRel.startsWith('..') || path.isAbsolute(finalRel)) {
    throw new Error(`Path outside data root: ${p}`);
  }

  return finalPath;
}

// ---------------------------------------------------------------------------
// JSON 工具
// ---------------------------------------------------------------------------

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function sendError(res, status, message) {
  sendJson(res, status, { ok: false, error: message });
}

// ---------------------------------------------------------------------------
// 文件系统 API
// ---------------------------------------------------------------------------

async function handleFsApi(req, res, url) {
  // url.pathname 形如 /api/fs/<op>
  const op = url.pathname.slice('/api/fs/'.length);
  const q = (name) => url.searchParams.get(name) || '';

  try {
    switch (op) {
      case 'resolvePath': {
        const parts = url.searchParams.getAll('paths');
        const abs = parts.length > 0 ? path.resolve(DATA_ROOT, ...parts) : DATA_ROOT;
        sendJson(res, 200, { ok: true, path: toAbs(abs) });
        break;
      }
      case 'exists': {
        const p = toAbs(q('path'));
        sendJson(res, 200, { ok: true, result: await fsp.access(p).then(() => true).catch(() => false) });
        break;
      }
      case 'isDirectory': {
        const p = toAbs(q('path'));
        let result = false;
        try {
          result = (await fsp.stat(p)).isDirectory();
        } catch { /* 不存在 → false */ }
        sendJson(res, 200, { ok: true, result });
        break;
      }
      case 'isFile': {
        const p = toAbs(q('path'));
        let result = false;
        try {
          result = (await fsp.stat(p)).isFile();
        } catch { /* 不存在 → false */ }
        sendJson(res, 200, { ok: true, result });
        break;
      }
      case 'readDir': {
        const p = toAbs(q('path'));
        let entries = [];
        try {
          entries = await fsp.readdir(p);
        } catch { /* 目录不存在 → [] */ }
        sendJson(res, 200, { ok: true, result: entries });
        break;
      }
      case 'readFile': {
        // GET /api/fs/readFile?path=<abs> → 原始字节
        // 按扩展名设置 Content-Type：图片等可直接作为 <img src> 使用
        const p = toAbs(q('path'));
        try {
          const data = await fsp.readFile(p);
          const ext = path.extname(p).toLowerCase();
          const contentType = MIME[ext] || 'application/octet-stream';
          res.writeHead(200, {
            'Content-Type': contentType,
            'Content-Length': data.length,
          });
          res.end(data);
        } catch (e) {
          sendError(res, 404, `readFile failed: ${p} — ${e.message}`);
        }
        break;
      }
      case 'writeFile': {
        // POST ?path=<abs>，body 为原始字节
        const p = toAbs(q('path'));
        await fsp.mkdir(path.dirname(p), { recursive: true });
        const chunks = [];
        for await (const chunk of req) {
          chunks.push(chunk);
        }
        await fsp.writeFile(p, Buffer.concat(chunks));
        sendJson(res, 200, { ok: true });
        break;
      }
      case 'mkdirs': {
        const p = toAbs(q('path'));
        await fsp.mkdir(p, { recursive: true });
        sendJson(res, 200, { ok: true });
        break;
      }
      case 'remove': {
        const p = toAbs(q('path'));
        await fsp.rm(p, { recursive: true, force: true });
        sendJson(res, 200, { ok: true });
        break;
      }
      case 'rename': {
        const from = toAbs(q('from'));
        const to = toAbs(q('to'));
        await fsp.mkdir(path.dirname(to), { recursive: true });
        await fsp.rename(from, to);
        sendJson(res, 200, { ok: true });
        break;
      }
      case 'fileSize': {
        const p = toAbs(q('path'));
        let size = 0;
        try {
          size = (await fsp.stat(p)).size;
        } catch { /* 不存在 → 0 */ }
        sendJson(res, 200, { ok: true, result: size });
        break;
      }
      case 'listFilesRecursive': {
        const p = toAbs(q('path'));
        const result = [];
        async function walk(d) {
          let entries;
          try {
            entries = await fsp.readdir(d, { withFileTypes: true });
          } catch {
            return;
          }
          for (const e of entries) {
            const full = path.join(d, e.name);
            if (e.isDirectory()) {
              await walk(full);
            } else if (e.isFile()) {
              result.push(full);
            }
          }
        }
        await walk(p);
        sendJson(res, 200, { ok: true, result });
        break;
      }
      case 'lastModified': {
        const p = toAbs(q('path'));
        let ms = 0;
        try {
          ms = (await fsp.stat(p)).mtimeMs;
        } catch { /* 不存在 → 0 */ }
        sendJson(res, 200, { ok: true, result: ms });
        break;
      }
      default:
        sendError(res, 404, `Unknown op: ${op}`);
    }
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

// ---------------------------------------------------------------------------
// 静态文件托管（SPA fallback）
// ---------------------------------------------------------------------------

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.map': 'application/json',
};

function serveStatic(res, urlPath) {
  const decoded = decodeURIComponent(urlPath);
  let filePath = path.normalize(path.join(WEB_ROOT, decoded));
  if (!filePath.startsWith(WEB_ROOT)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch {
    filePath = path.join(WEB_ROOT, 'index.html');
    try {
      stat = fs.statSync(filePath);
    } catch {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }
  }

  if (stat.isDirectory()) {
    filePath = path.join(filePath, 'index.html');
    try {
      stat = fs.statSync(filePath);
    } catch {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }
  }

  const ext = path.extname(filePath).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';
  res.writeHead(200, {
    'Content-Type': type,
    'Content-Length': stat.size,
    'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
  });
  fs.createReadStream(filePath).pipe(res);
}

// ---------------------------------------------------------------------------
// HTTP server
// ---------------------------------------------------------------------------

const requestHandler = (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (url.pathname.startsWith('/api/fs/')) {
    handleFsApi(req, res, url).catch((e) => sendError(res, 500, e.message));
    return;
  }

  if (url.pathname === '/api/health') {
    sendJson(res, 200, { ok: true, dataRoot: DATA_ROOT, https: USE_HTTPS });
    return;
  }

  serveStatic(res, url.pathname);
};

// ---------------------------------------------------------------------------
// 启动
// ---------------------------------------------------------------------------

try {
  await fsp.mkdir(DATA_ROOT, { recursive: true });
} catch { /* 已存在 */ }

if (USE_HTTPS) {
  const { cert, key } = await ensureSelfSignedCert();
  const httpsServer = https.createServer({ cert, key }, requestHandler);
  httpsServer.listen(PORT, HOST, () => {
    console.log(`[cfgforge-server] listening on https://${HOST}:${PORT}`);
    console.log(`[cfgforge-server] data root: ${DATA_ROOT}`);
    console.log(`[cfgforge-server] web root: ${WEB_ROOT}`);
    console.log(`[cfgforge-server] HTTPS enabled (self-signed cert)`);
    console.log(`[cfgforge-server] Chrome will warn about the self-signed certificate.`);
    console.log(`[cfgforge-server] Click "Advanced → Continue" to proceed.`);
  });
} else {
  const server = http.createServer(requestHandler);
  server.listen(PORT, HOST, () => {
    console.log(`[cfgforge-server] listening on http://${HOST}:${PORT}`);
    console.log(`[cfgforge-server] data root: ${DATA_ROOT}`);
    console.log(`[cfgforge-server] web root: ${WEB_ROOT}`);
  });
}
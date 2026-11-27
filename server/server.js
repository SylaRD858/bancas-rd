/*
 * BancaRD — servidor central opcional (Node.js 18+, sin dependencias)
 * Sirve la app y sincroniza los datos entre todas las bancas.
 *
 *   node server/server.js            (puerto 8080 por defecto)
 *   PORT=3000 DATA_DIR=/datos node server/server.js
 *
 * Los navegadores detectan /api/ping automáticamente y pasan a "modo servidor".
 * Los datos se guardan en DATA_DIR/db.json (se respalda cada hora en DATA_DIR/backups).
 * IMPORTANTE: póngalo detrás de HTTPS (Render, Railway, Fly.io, un VPS con Caddy/Nginx).
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 8080;
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
const DB_FILE = path.join(DATA_DIR, 'db.json');

fs.mkdirSync(path.join(DATA_DIR, 'backups'), { recursive: true });
let db = { records: {} }; // key "coll/id" -> { c, rec, t }
try { db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch (e) { /* nuevo */ }

let dirty = false;
setInterval(() => { if (!dirty) return; dirty = false; fs.writeFile(DB_FILE + '.tmp', JSON.stringify(db), err => { if (!err) fs.rename(DB_FILE + '.tmp', DB_FILE, () => { }); }); }, 1000);
setInterval(() => { fs.copyFile(DB_FILE, path.join(DATA_DIR, 'backups', 'db_' + new Date().toISOString().slice(0, 13).replace(/[:T]/g, '-') + '.json'), () => { }); }, 3600000);

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.ico': 'image/x-icon' };

function send(res, code, obj) { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); }

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname.startsWith('/api/')) {
    if (url.pathname === '/api/ping') return send(res, 200, { bancard: true, now: Date.now() });
    if (url.pathname === '/api/changes' && req.method === 'GET') {
      const since = Number(url.searchParams.get('since')) || 0; const now = Date.now();
      const records = Object.values(db.records).filter(r => r.t > since).map(r => ({ c: r.c, rec: r.rec }));
      return send(res, 200, { now, records });
    }
    if (url.pathname === '/api/put' && req.method === 'POST') {
      let body = ''; req.on('data', d => { body += d; if (body.length > 20e6) req.destroy(); });
      req.on('end', () => {
        try {
          const { records } = JSON.parse(body); const t = Date.now(); let n = 0;
          (records || []).forEach(({ c, rec }) => {
            if (!c || !rec || !rec.id) return; const k = c + '/' + rec.id; const cur = db.records[k];
            if (!cur || (rec.updatedAt || 0) >= (cur.rec.updatedAt || 0)) { db.records[k] = { c, rec, t }; n++; }
          });
          dirty = true; send(res, 200, { ok: true, n });
        } catch (e) { send(res, 400, { error: e.message }); }
      });
      return;
    }
    return send(res, 404, { error: 'not found' });
  }
  // archivos estáticos
  let p = decodeURIComponent(url.pathname); if (p === '/') p = '/index.html';
  const file = path.join(ROOT, path.normalize(p).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(ROOT) || file.startsWith(path.join(ROOT, 'server'))) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('No encontrado'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' }); res.end(data);
  });
});
server.listen(PORT, () => console.log(`BancaRD escuchando en http://localhost:${PORT}  (datos: ${DB_FILE})`));

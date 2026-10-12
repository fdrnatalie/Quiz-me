'use strict';
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const game = require('./lib/game');

const PORT = Number(process.env.PORT) || 3000;
const DATA_FILE = process.env.QUIZ_DATA || path.join(__dirname, 'data', 'quiz.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
};
const PAGES = { '/': 'index.html', '/tv': 'tv.html', '/play': 'play.html' };

// ---------- estado ----------
let state = load();
let saveTimer = null;

function load() {
  try {
    const s = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    if (s && Array.isArray(s.guests) && Array.isArray(s.questions) && s.game) return s;
  } catch (e) {
    /* primeiro uso ou arquivo inválido: começa do zero */
  }
  return game.defaultState();
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
      fs.writeFileSync(DATA_FILE + '.tmp', JSON.stringify(state));
      fs.renameSync(DATA_FILE + '.tmp', DATA_FILE);
    } catch (e) {
      console.error('Não consegui salvar o quiz:', e.message);
    }
  }, 150);
}

// ---------- tempo real (Server-Sent Events) ----------
const clients = new Set();

function lanUrls() {
  const urls = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list || []) {
      if (i.family === 'IPv4' && !i.internal) urls.push(`http://${i.address}:${PORT}`);
    }
  }
  return urls;
}

function payload(role) {
  const v = game.view(state, role);
  v.lan = lanUrls();
  return JSON.stringify(v);
}

function broadcast() {
  const cache = {};
  for (const c of clients) {
    cache[c.role] = cache[c.role] || payload(c.role);
    c.res.write(`data: ${cache[c.role]}\n\n`);
  }
}

setInterval(() => {
  for (const c of clients) c.res.write(': ping\n\n');
}, 25000).unref();

// ---------- HTTP ----------
function send(res, code, body, type = 'application/json; charset=utf-8') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (c) => {
      raw += c;
      if (raw.length > 100000) {
        reject(new Error('corpo grande demais'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(new Error('JSON inválido'));
      }
    });
    req.on('error', reject);
  });
}

function serveStatic(req, res, pathname) {
  const rel = PAGES[pathname] || pathname.replace(/^\/+/, '');
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) return send(res, 403, 'Proibido', 'text/plain; charset=utf-8');
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, 'Não encontrado', 'text/plain; charset=utf-8');
    send(res, 200, data, MIME[path.extname(file)] || 'application/octet-stream');
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (req.method === 'GET' && url.pathname === '/events') {
      const role = ['host', 'tv', 'play'].includes(url.searchParams.get('role')) ? url.searchParams.get('role') : 'tv';
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-store',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      res.write('retry: 2000\n\n');
      const client = { res, role };
      clients.add(client);
      res.write(`data: ${payload(role)}\n\n`);
      req.on('close', () => clients.delete(client));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/host') {
      const body = await readJson(req);
      const error = game.applyHostAction(state, body);
      if (error) return send(res, 400, { error });
      scheduleSave();
      broadcast();
      return send(res, 200, { ok: true });
    }

    if (req.method === 'POST' && url.pathname === '/api/play/answer') {
      const body = await readJson(req);
      const error = game.applyPlayerAnswer(state, body);
      if (error) return send(res, 400, { error });
      scheduleSave();
      broadcast();
      return send(res, 200, { ok: true });
    }

    if (req.method === 'GET' || req.method === 'HEAD') return serveStatic(req, res, url.pathname);
    return send(res, 405, { error: 'Método não permitido' });
  } catch (e) {
    return send(res, 400, { error: e.message });
  }
});

if (require.main === module) {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Quiz rodando em http://localhost:${PORT}`);
    console.log('  Apresentadora:  /      TV:  /tv      Celular:  /play');
    for (const u of lanUrls()) console.log(`  Na rede local:  ${u}`);
  });
}

module.exports = { server, getState: () => state };

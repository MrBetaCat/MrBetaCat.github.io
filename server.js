#!/usr/bin/env node
/**
 * server.js — local dev server for Sprint pages
 *
 * Usage:
 *   node server.js          (default port 3000)
 *   node server.js 8080     (custom port)
 *
 * - Serves all static files from this directory
 * - Handles file writes/deletes via a simple REST API
 *   PUT    /api/write?path=content/blog/t1.md   body = file content
 *   DELETE /api/write?path=content/blog/t1.md
 *
 * Only paths inside content/ are writable (others return 403).
 */

const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT    = parseInt(process.argv[2]) || 3000;
const ROOT    = __dirname;
const CONTENT = path.join(ROOT, 'content');

// Ensure content subdirectories exist on first run
['slides', 'handout', 'blog', 'code_examples'].forEach(d =>
  fs.mkdirSync(path.join(CONTENT, d), { recursive: true }));
if (!fs.existsSync(path.join(CONTENT, 'status.json')))
  fs.writeFileSync(path.join(CONTENT, 'status.json'), '{}');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md':   'text/plain; charset=utf-8',
  '.b64':  'text/plain; charset=utf-8',
  '.txt':  'text/plain; charset=utf-8',
  '.ico':  'image/x-icon',
  '.png':  'image/png',
  '.svg':  'image/svg+xml',
};

/** Resolve a URL path to a real path that must sit inside content/. */
function safeContentPath(rawPath) {
  const rel  = decodeURIComponent(rawPath).replace(/^\/+/, '');
  if (!rel.startsWith('content/')) return null;
  const full = path.resolve(ROOT, rel);
  if (!full.startsWith(CONTENT + path.sep) && full !== CONTENT) return null;
  return full;
}

function readBody(req) {
  return new Promise(res => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => res(Buffer.concat(chunks).toString('utf8')));
  });
}

http.createServer(async (req, res) => {
  const url    = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const method = req.method.toUpperCase();

  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // ── Write / Delete API ───────────────────────────────────────────────────
  if (url.pathname === '/api/write') {
    const filePath = safeContentPath(url.searchParams.get('path') || '');
    if (!filePath) { res.writeHead(400); res.end('Invalid or disallowed path'); return; }

    if (method === 'PUT') {
      const body = await readBody(req);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, body, 'utf8');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"ok":true}');
      console.log(`  WRITE  ${path.relative(ROOT, filePath)}`);
      return;
    }

    if (method === 'DELETE') {
      try { fs.unlinkSync(filePath); console.log(`  DELETE ${path.relative(ROOT, filePath)}`); }
      catch {}
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"ok":true}');
      return;
    }

    res.writeHead(405); res.end(); return;
  }

  // ── Static file serving ──────────────────────────────────────────────────
  if (method !== 'GET') { res.writeHead(405); res.end(); return; }

  const pathname = url.pathname === '/' ? '/ai-agent-course.html' : url.pathname;
  const filePath = path.resolve(ROOT, pathname.replace(/^\//, ''));

  if (!filePath.startsWith(ROOT + path.sep) && filePath !== ROOT) {
    res.writeHead(403); res.end(); return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const mime = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime });
    res.end(data);
  });
}).listen(PORT, '127.0.0.1', () => {
  console.log(`\nSprint local server → http://localhost:${PORT}`);
  console.log(`  Slides & Handout (edit)    : http://localhost:${PORT}/ai-agent-course.html`);
  console.log(`  Slides & Handout (preview) : http://localhost:${PORT}/ai-agent-course-preview.html`);
  console.log(`  Blog & Code (edit)         : http://localhost:${PORT}/ai-blog.html`);
  console.log(`  Blog (preview)             : http://localhost:${PORT}/ai-blog-preview.html`);
  console.log('\nPress Ctrl+C to stop.\n');
});

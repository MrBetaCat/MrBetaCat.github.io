'use strict';
/**
 * sprint-storage.js — fetch-based storage, no folder picker
 *
 * READS (both localhost and GitHub Pages):
 *   fetch() from relative URLs — static files served by server.js or GitHub Pages CDN.
 *   On localhost a cache-buster (?_=timestamp) is added so edits appear immediately.
 *   On GitHub Pages no cache-buster is used — CDN serves the committed version.
 *
 * WRITES (requires server.js to be running):
 *   PUT    /api/write?path=…   (server.js writes the file)
 *   DELETE /api/write?path=…
 *   On GitHub Pages these return 404; the caller's catch block surfaces the error.
 *
 * Content layout (relative to repo root):
 *   content/slides/t{N}.url          relative path or URL to HTML slides
 *   content/handout/t{N}.md          plain markdown
 *   content/blog/t{N}.md             YAML frontmatter + markdown body
 *   content/code_examples/t{N}.json  JSON array of code snippets
 *   content/status.json              manifest: which topics have which files
 */

const FS = (() => {
  const IS_LOCAL = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  let mem = {}; // in-memory cache: key → decoded value string

  // ── Key → relative file path ──────────────────────────────────────────────
  function keyToPath(key) {
    const m = key.match(/^sprint_t(\d+)_(slides|handout|blog|code)$/);
    if (m) {
      const [, n, type] = m;
      if (type === 'slides')  return `content/slides/t${n}.url`;
      if (type === 'handout') return `content/handout/t${n}.md`;
      if (type === 'blog')    return `content/blog/t${n}.md`;
      if (type === 'code')    return `content/code_examples/t${n}.json`;
    }
    if (key === 'sprint_status') return 'content/status.json';
    return null;
  }

  // ── Blog: JSON in memory ↔ YAML frontmatter on disk ──────────────────────
  function encodeBlog(jsonStr) {
    let d; try { d = JSON.parse(jsonStr); } catch { d = {}; }
    return `---\ntitle: ${d.title||''}\nsubtitle: ${d.subtitle||''}\ndate: ${d.date||''}\ntags: ${d.tags||''}\n---\n\n${d.body||''}`;
  }

  function decodeBlog(md) {
    const m = md.match(/^---\n([\s\S]*?)\n---\n?\n?([\s\S]*)/);
    if (!m) return JSON.stringify({title:'',subtitle:'',date:'',tags:'',body:md});
    const fm = m[1], body = m[2];
    const get = k => { const r = fm.match(new RegExp(`^${k}:\\s*(.*)`, 'm')); return r ? r[1].trim() : ''; };
    return JSON.stringify({title:get('title'),subtitle:get('subtitle'),date:get('date'),tags:get('tags'),body});
  }

  function encodeForDisk(key, val) { return key.endsWith('_blog') ? encodeBlog(val) : val; }
  function decodeFromDisk(key, text) { return key.endsWith('_blog') ? decodeBlog(text) : text; }

  // ── HTTP helpers ──────────────────────────────────────────────────────────
  async function fetchRead(path) {
    try {
      // Cache-buster only on localhost so local edits are always fresh;
      // on GitHub Pages the CDN should serve the committed version without extra origin hits.
      const url = IS_LOCAL ? `${path}?_=${Date.now()}` : path;
      const r = await fetch(url);
      return r.ok ? await r.text() : null;
    } catch { return null; }
  }

  async function fetchWrite(path, content) {
    const r = await fetch(`/api/write?path=${encodeURIComponent(path)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      body: content,
    });
    if (!r.ok) throw new Error(`Write failed (HTTP ${r.status})`);
  }

  async function fetchDelete(path) {
    const r = await fetch(`/api/write?path=${encodeURIComponent(path)}`, {
      method: 'DELETE',
    });
    if (!r.ok && r.status !== 404) throw new Error(`Delete failed (HTTP ${r.status})`);
  }

  // ── Status.json helpers ───────────────────────────────────────────────────
  function _updateStatusCache(n, type, present) {
    let s = {};
    try { s = JSON.parse(mem['sprint_status'] || '{}'); } catch {}
    if (!s[`t${n}`]) s[`t${n}`] = {};
    if (present) {
      s[`t${n}`][type] = true;
    } else {
      delete s[`t${n}`][type];
      if (!Object.keys(s[`t${n}`]).length) delete s[`t${n}`];
    }
    mem['sprint_status'] = JSON.stringify(s, null, 2);
  }

  // ── Public API ────────────────────────────────────────────────────────────
  return {
    /** Writes use relative /api/write — works on any host running server.js. */
    get canWrite() { return true; },

    /** No-op — kept so pages can call await FS.init() without errors. */
    async init() { return 'ready'; },

    /** Load content/status.json for sidebar status dots. */
    async loadStatus() {
      const text = await fetchRead('content/status.json');
      if (text) {
        mem['sprint_status'] = text;
        try { return JSON.parse(text); } catch {}
      }
      return {};
    },

    /** Fetch all content files for topic N into the in-memory cache. */
    async loadTopic(n) {
      const types = ['slides', 'handout', 'blog', 'code'];
      await Promise.all(types.map(async type => {
        const key  = `sprint_t${n}_${type}`;
        const path = keyToPath(key);
        const text = await fetchRead(path);
        if (text !== null) mem[key] = decodeFromDisk(key, text);
        else delete mem[key];
      }));
    },

    /** Re-fetch topic N (call on visibilitychange in preview pages). */
    async refresh(n) {
      if (n !== undefined) await this.loadTopic(n);
    },

    // ── Sync read from in-memory cache ────────────────────────────────────
    get(key) { return mem[key] ?? null; },

    // ── Async write ───────────────────────────────────────────────────────
    async set(key, val) {
      const path = keyToPath(key);
      if (!path) throw new Error(`Unknown key: ${key}`);
      await fetchWrite(path, encodeForDisk(key, val));
      mem[key] = val;
      const m = key.match(/^sprint_t(\d+)_(slides|handout|blog|code)$/);
      if (m) {
        _updateStatusCache(m[1], m[2], true);
        await fetchWrite('content/status.json', mem['sprint_status'] || '{}');
      }
    },

    // ── Async delete ──────────────────────────────────────────────────────
    async del(key) {
      const path = keyToPath(key);
      if (!path) return;
      await fetchDelete(path);
      delete mem[key];
      const m = key.match(/^sprint_t(\d+)_(slides|handout|blog|code)$/);
      if (m) {
        _updateStatusCache(m[1], m[2], false);
        await fetchWrite('content/status.json', mem['sprint_status'] || '{}');
      }
    },
  };
})();

'use strict';
/**
 * sprint-storage.js  v4 — fetch-based, no folder picker
 *
 * LOCAL  (http://localhost — run `node server.js`):
 *   Reads  via fetch() from relative URLs
 *   Writes via PUT    /api/write?path=…  (server.js writes the file)
 *   Deletes via DELETE /api/write?path=…
 *
 * DEPLOYED (https:// — GitHub Pages):
 *   Reads  via fetch() from relative URLs  ← static files committed to repo
 *   Writes blocked                         ← read-only for visitors
 *
 * No folder picker, no permissions, no tokens.
 * To edit: run `node server.js`, open http://localhost:3000
 *
 * Content layout (relative to repo root):
 *   content/slides/t{N}.b64          base64-encoded .pptx bytes
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
      const r = await fetch(`${path}?_=${Date.now()}`);
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
    /** True when running on localhost — writes are allowed. */
    get canWrite() { return IS_LOCAL; },

    /** No-op — kept so pages can call await FS.init() without errors. */
    async init() { return IS_LOCAL ? 'local' : 'remote'; },

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

    // ── Async write — local server only ──────────────────────────────────
    async set(key, val) {
      if (!IS_LOCAL) throw new Error('Read-only on deployed site. Edit locally with `node server.js`.');
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

    // ── Async delete — local server only ─────────────────────────────────
    async del(key) {
      if (!IS_LOCAL) throw new Error('Read-only on deployed site.');
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

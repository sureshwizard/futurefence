// server.js (ESM)
// Requires Node 18+ and package.json with: { "type": "module" }

import express from "express";
import cors from "cors";
import { ESLint } from "eslint";
import config from "./eslint.config.mjs";

// --- Simple one-file HTML playground (served at /playground) ---
const PLAYGROUND_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>FeatureFence API Playground</title>
  <style>
    :root { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"; }
    body { margin: 0; background: #0b0f14; color: #e6edf3; }
    header { padding: 20px; border-bottom: 1px solid #1f2a37; background: #0f1620; position: sticky; top: 0; }
    main { padding: 16px; display: grid; gap: 16px; grid-template-columns: 1fr 1fr; }
    h1 { margin: 0 0 4px 0; font-size: 18px; }
    .card { background: #0f1720; border: 1px solid #1f2a37; border-radius: 12px; padding: 12px; }
    label { display: block; font-size: 12px; opacity: .9; margin: 10px 0 6px; }
    input, select, textarea { width: 100%; background: #0b1220; color: #eef2f7; border: 1px solid #243447; border-radius: 8px; padding: 10px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
    textarea { min-height: 220px; }
    button { cursor: pointer; border: 1px solid #2d3a4d; background: #182230; color: #e6edf3; padding: 10px 14px; border-radius: 10px; font-weight: 600; }
    .row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    pre { margin: 0; white-space: pre-wrap; word-break: break-word; }
    .muted { opacity: .75; font-size: 12px; }
    @media (max-width: 960px){ main { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <header>
    <h1>FeatureFence – API Playground</h1>
    <div class="muted">Pick a language, paste code, set targets, then Run. The JSON result and exact cURL appear on the right.</div>
  </header>
  <main>
    <section class="card">
      <div class="row">
        <div>
          <label>API Base URL</label>
          <input id="base" value="" placeholder="e.g. http://localhost:4073" />
        </div>
        <div>
          <label>Endpoint</label>
          <select id="endpoint">
            <option value="/api/status">GET /api/status</option>
            <option value="/api/lint" selected>POST /api/lint</option>
            <option value="/api/echo">POST /api/echo</option>
          </select>
        </div>
      </div>
      <div class="row">
        <div>
          <label>Language</label>
          <select id="language">
            <option>javascript</option>
            <option>css</option>
            <option>html</option>
            <option>python</option>
          </select>
        </div>
        <div>
          <label>Targets (Browserslist)</label>
          <input id="targets" value=">=0.5%, last 2 versions, not dead" />
        </div>
      </div>
      <label>Code</label>
      <textarea id="code">document.startViewTransition(() => {
  console.log("demo");
});</textarea>
      <div style="display:flex; gap:8px; margin-top:10px; align-items:center;">
        <button id="run">Run</button>
        <span class="muted">Status: <span id="status">idle</span></span>
      </div>
    </section>

    <section class="card">
      <label>Result JSON</label>
      <pre id="out">(awaiting run)</pre>
      <label style="margin-top:12px">cURL used</label>
      <pre id="curl"></pre>
    </section>
  </main>
  <script>
    const s = (id) => document.getElementById(id);
    const baseInput = s('base');
    baseInput.value = location.origin;

    async function run() {
      const base = (baseInput.value || '').replace(/\\/$/, '');
      const ep = s('endpoint').value;
      s('status').textContent = 'running…';
      s('out').textContent = '';
      s('curl').textContent = '';

      try {
        if (ep === '/api/status') {
          const url = base + ep;
          const res = await fetch(url);
          const json = await res.json();
          s('out').textContent = JSON.stringify(json, null, 2);
          s('curl').textContent = 'curl -i "' + url + '"';
        } else {
          const body = {
            language: s('language').value,
            targets: s('targets').value,
            code: s('code').value
          };
          const url = base + ep;
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
          });
          const json = await res.json();
          s('out').textContent = JSON.stringify(json, null, 2);

          // Safe curl (double-quoted JSON with \" escapes)
          const jsonForCurl = JSON.stringify(body).replace(/"/g, '\\"');
          s('curl').textContent =
            'curl -i -X POST "' + url + '" \\\\n' +
            '  -H "Content-Type: application/json" \\\\n' +
            '  -d "' + jsonForCurl + '"';
        }
        s('status').textContent = 'done';
      } catch (e) {
        s('status').textContent = 'error';
        s('out').textContent = String(e);
      }
    }

    s('run').addEventListener('click', run);
  </script>
</body>
</html>`;

// ----------------------- Express app -----------------------
const app = express();

app.use(cors());
app.use(express.json({ limit: "500kb" }));

// 1) Playground
app.get(["/", "/playground"], (_req, res) => {
  res.type("html").send(PLAYGROUND_HTML);
});

// 2) Health
app.get("/api/status", (_req, res) => {
  res.json({
    ok: true,
    name: "FeatureFence Playground API",
    time: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || "dev"
  });
});

// 3) Echo
app.post("/api/echo", (req, res) => {
  res.json({
    method: req.method,
    path: req.path,
    headers: req.headers,
    body: req.body
  });
});

// Helper: Normalize ESLint results
function toItems(eslintResults) {
  const r = eslintResults?.[0];
  const messages = r?.messages || [];
  const items = messages.map(m => ({
    rule: m.ruleId || "(no-rule)",
    message: m.message,
    severity: m.severity === 2 ? "error" : "warn",
    location: {
      line: m.line, column: m.column,
      endLine: m.endLine, endColumn: m.endColumn
    }
  }));
  const errorCount = messages.filter(m => m.severity === 2).length;
  const warnCount = messages.filter(m => m.severity !== 2).length;
  return {
    summary: {
      level: errorCount ? "error" : (warnCount ? "warn" : "ok"),
      errors: errorCount, warnings: warnCount, total: messages.length
    },
    items
  };
}

// 4) Lint
// Body: { language: 'javascript'|'css'|'html'|'python', code: string, targets?: string }
app.post("/api/lint", async (req, res) => {
  try {
    const { language, code } = req.body || {};
    if (typeof code !== "string" || !code.trim()) {
      return res.status(400).json({ error: "Missing 'code' (string)" });
    }

    const lang = String(language || "javascript").toLowerCase();

    if (lang === "javascript" || lang === "js") {
      const eslint = new ESLint({
        overrideConfig: Array.isArray(config) ? config[0] : config
      });
      const results = await eslint.lintText(code, { filePath: "input.js" });
      const { summary, items } = toItems(results);
      return res.json({ ok: true, language: lang, summary, items });
    }

    // Placeholders for other languages
    return res.json({
      ok: true,
      language: lang,
      summary: { level: "warn", errors: 0, warnings: 1, total: 1 },
      items: [{
        rule: "unsupported-language",
        message: "Language '" + lang + "' is not yet supported by this server. Use 'javascript' to see ESLint-based results.",
        severity: "warn",
        location: { line: 1, column: 1 }
      }]
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: String(e) });
  }
});

// 404 JSON fallback
app.use((req, res) => {
  res.status(404).json({ error: `Not found: ${req.method} ${req.originalUrl}` });
});

// Start server
const PORT = process.env.PORT || 4073;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`FeatureFence Playground API running on http://0.0.0.0:${PORT}`);
});


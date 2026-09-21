/**
 * HTML rendering for GET /v1/models?ui
 *
 * Returns a standalone, intentionally unauthenticated page that presents the
 * exact same models payload as JSON in an easily navigated tree. The tree
 * itself is rendered by `vanilla-jsoneditor` (npm, framework-agnostic,
 * ~260k weekly downloads, actively maintained) loaded from the jsDelivr CDN —
 * no custom JSON display code is implemented here.
 *
 * Only Plexus theme tokens (colors, fonts, radii) are reused. None of the
 * authenticated admin UI is included, linked, or reachable from this page.
 */

/** Version of the `vanilla-jsoneditor` npm package used by the ?ui page. Keep in sync with package.json. */
export const VANILLA_JSONEDITOR_VERSION = '3.13.0';

const CDN_BASE = `https://cdn.jsdelivr.net/npm/vanilla-jsoneditor@${VANILLA_JSONEDITOR_VERSION}`;

/**
 * Render the standalone models viewer page.
 *
 * @param payloadJson The serialized `/v1/models` JSON payload to embed.
 * @param modelCount Number of models in the payload (shown in the header).
 */
export function renderModelsUiPage(payloadJson: string, modelCount: number): string {
  // Neutralize `</script` sequences so model descriptions can never break out
  // of the embedded JSON block. `<\/` is a valid JSON string escape that
  // parses back to the original value.
  const safeJson = payloadJson.replace(/<\//g, '<\\/');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Plexus Models</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link
  href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,700&family=JetBrains+Mono:wght@400;500&display=swap"
  rel="stylesheet"
/>
<link rel="stylesheet" href="${CDN_BASE}/themes/jse-theme-dark.css" />
<style>
  :root {
    --mx-bg-deep: #000000;
    --mx-bg-card: #0f172a;
    --mx-bg-card-2: #111a30;
    --mx-primary: #f59e0b;
    --mx-secondary: #fbbf24;
    --mx-cta: #8b5cf6;
    --mx-text: #f8fafc;
    --mx-text-secondary: #94a3b8;
    --mx-text-muted: #64748b;
    --mx-border: #1e293b;
    --mx-border-2: #334155;
    --mx-font-heading: 'Space Grotesk', ui-sans-serif, system-ui, sans-serif;
    --mx-font-body: 'DM Sans', ui-sans-serif, system-ui, sans-serif;
    --mx-font-mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
  }
  *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: var(--mx-font-body);
    font-size: 0.875rem;
    line-height: 1.5;
    color: var(--mx-text);
    background-color: var(--mx-bg-deep);
    background-image:
      radial-gradient(1100px 600px at 12% -10%, rgba(245, 158, 11, 0.06), transparent 60%),
      radial-gradient(900px 500px at 110% 10%, rgba(139, 92, 246, 0.05), transparent 60%);
    -webkit-font-smoothing: antialiased;
    min-height: 100vh;
  }
  .wrap { max-width: 1100px; margin: 0 auto; padding: 32px 20px 48px; }
  header {
    display: flex; flex-wrap: wrap; align-items: center; gap: 12px 16px;
    padding: 20px 24px; margin-bottom: 20px;
    background: rgba(15, 23, 42, 0.72);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 16px;
    backdrop-filter: blur(20px) saturate(140%);
  }
  .brand { font-family: var(--mx-font-heading); font-size: 1.5rem; letter-spacing: -0.01em; }
  .brand .plexus {
    background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 60%, #d97706 100%);
    -webkit-background-clip: text; background-clip: text; color: transparent;
    font-weight: 700;
  }
  .brand .sep { color: var(--mx-text-muted); font-weight: 500; margin: 0 8px; }
  .count {
    font-family: var(--mx-font-mono); font-size: 0.75rem; color: var(--mx-secondary);
    border: 1px solid var(--mx-border-2); border-radius: 999px; padding: 2px 10px;
    background: rgba(245, 158, 11, 0.08); white-space: nowrap;
  }
  .sub { flex-basis: 100%; color: var(--mx-text-secondary); font-size: 0.875rem; }
  .sub code { font-family: var(--mx-font-mono); font-size: 0.8rem; color: var(--mx-text); }
  .toolbar { display: flex; flex-wrap: wrap; gap: 8px; margin-left: auto; }
  .btn {
    font-family: var(--mx-font-body); font-size: 0.8rem; font-weight: 500;
    color: var(--mx-text); background: rgba(51, 65, 85, 0.45);
    border: 1px solid var(--mx-border-2); border-radius: 10px;
    padding: 7px 14px; cursor: pointer; text-decoration: none; white-space: nowrap;
  }
  .btn:hover { border-color: var(--mx-primary); color: var(--mx-secondary); }
  .btn.primary {
    background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 60%, #d97706 100%);
    border-color: transparent; color: #1a1006; font-weight: 700;
  }
  .btn:focus-visible { outline: 2px solid var(--mx-primary); outline-offset: 2px; }
  .hint { color: var(--mx-text-muted); font-size: 0.75rem; margin: 0 0 12px 4px; }
  .hint kbd {
    font-family: var(--mx-font-mono); font-size: 0.7rem;
    border: 1px solid var(--mx-border-2); border-bottom-width: 2px; border-radius: 6px;
    padding: 0 6px; background: var(--mx-bg-card);
  }
  #models-tree {
    border: 1px solid var(--mx-border); border-radius: 16px; overflow: hidden;
    background: var(--mx-bg-card); min-height: 420px;
    /* Recolor the viewer's menu bar from library-default blue to Plexus slate. */
    --jse-theme-color: #1e293b;
    --jse-theme-color-highlight: #334155;
  }
  #models-tree .jse-main { min-height: 420px; }
  .loading, .fallback { padding: 32px; color: var(--mx-text-secondary); }
  .fallback pre {
    margin-top: 12px; padding: 16px; overflow: auto; max-height: 70vh;
    font-family: var(--mx-font-mono); font-size: 0.75rem;
    background: #05070d; border: 1px solid var(--mx-border); border-radius: 10px;
  }
  footer { margin-top: 20px; color: var(--mx-text-muted); font-size: 0.75rem; text-align: center; }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <div class="brand"><span class="plexus">Plexus</span><span class="sep">/</span>Models</div>
    <span class="count">${modelCount} model${modelCount === 1 ? '' : 's'}</span>
    <div class="toolbar">
      <button class="btn" id="expand-all" type="button">Expand all</button>
      <button class="btn" id="collapse-all" type="button">Collapse all</button>
      <button class="btn" id="copy-json" type="button">Copy JSON</button>
      <a class="btn primary" href="/v1/models">Raw JSON</a>
    </div>
    <p class="sub">Public snapshot of <code>GET /v1/models</code> — same payload, navigable tree. No login, no admin UI.</p>
  </header>
  <p class="hint">Tip: click a row to select it, or press <kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>F</kbd> inside the tree to search.</p>
  <div id="models-tree" class="jse-theme-dark"><div class="loading">Loading viewer…</div></div>
  <footer>Plexus &middot; unauthenticated models viewer</footer>
</div>
<script id="models-data" type="application/json">${safeJson}</script>
<script type="module">
  const treeEl = document.getElementById('models-tree');
  const data = JSON.parse(document.getElementById('models-data').textContent);

  async function fallback(reason) {
    console.warn('JSON tree viewer unavailable, showing raw JSON:', reason);
    const pre = document.createElement('pre');
    pre.textContent = JSON.stringify(data, null, 2);
    treeEl.innerHTML = '<div class="fallback">Interactive tree unavailable (viewer CDN unreachable). Raw payload:</div>';
    treeEl.querySelector('.fallback').appendChild(pre);
  }

  try {
    const { createJSONEditor } = await import('${CDN_BASE}/standalone.js');
    treeEl.innerHTML = '';
    const editor = createJSONEditor({
      target: treeEl,
      props: {
        content: { json: data },
        mode: 'tree',
        modes: ['tree', 'text'],
        readOnly: true,
        indentation: 2,
        statusBar: false,
      },
    });
    document.getElementById('expand-all').addEventListener('click', () => editor.expand([], () => true));
    document.getElementById('collapse-all').addEventListener('click', () => editor.collapse([], true));
    const copyBtn = document.getElementById('copy-json');
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
        copyBtn.textContent = 'Copied';
        setTimeout(() => { copyBtn.textContent = 'Copy JSON'; }, 1500);
      } catch (err) {
        copyBtn.textContent = 'Copy failed';
        setTimeout(() => { copyBtn.textContent = 'Copy JSON'; }, 1500);
      }
    });
  } catch (err) {
    await fallback(err);
  }
</script>
</body>
</html>`;
}

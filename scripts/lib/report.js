const VERDICT_LABEL = {
  ok: 'Up to date',
  behind: 'Behind',
  ahead: 'Ahead (dev is older)',
  differs: 'Differs (direction unknown)',
};

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function filename(url) {
  try {
    return new URL(url).pathname.split('/').pop();
  } catch {
    return url;
  }
}

function matchedRow(m) {
  return `
    <tr class="verdict-${m.verdict}">
      <td><code>${escapeHtml(filename(m.prod.url))}</code>${m.sameFile ? '' : `<br><span class="src">vs dev: <code>${escapeHtml(filename(m.dev.url))}</code></span>`}</td>
      <td>${fmtDate(m.prod.lastModified)}</td>
      <td>${fmtDate(m.dev.lastModified)}${m.devDateSource === 'git' ? ' <span class="src" title="From git commit history, not the dev server’s response header">(git)</span>' : ''}</td>
      <td><span class="badge badge-${m.verdict}">${VERDICT_LABEL[m.verdict] ?? m.verdict}</span></td>
    </tr>`;
}

function onlyList(label, sheets, cls) {
  if (sheets.length === 0) return '';
  const items = sheets.map((s) => `<li><code>${escapeHtml(filename(s.url))}</code></li>`).join('');
  return `
    <div class="only-list only-${cls}">
      <strong>${label} (${sheets.length}):</strong>
      <ul>${items}</ul>
      <p class="hint">Note: filenames that are entirely a content hash (no stable prefix) can't be matched across environments and will always land here, even if the same file exists on both sides.</p>
    </div>`;
}

function pageSection(page) {
  if (page.prodPageStatus !== 200) {
    return `
      <section class="page-block">
        <h2>${escapeHtml(page.path)}</h2>
        <p class="empty">Prod/QA page returned ${escapeHtml(String(page.prodPageStatus))} — skipped.</p>
      </section>`;
  }

  const behindCount = page.matched.filter((m) => m.verdict === 'behind').length;
  const hasContent = page.matched.length > 0 || page.prodOnly.length > 0 || page.devOnly.length > 0;

  if (!hasContent) {
    return `
      <section class="page-block">
        <h2>${escapeHtml(page.path)}</h2>
        <p class="empty">No stylesheets were captured for this page.</p>
      </section>`;
  }

  const rows = page.matched.map(matchedRow).join('');

  return `
    <section class="page-block">
      <h2>${escapeHtml(page.path)} ${behindCount ? `<span class="count-flag">${behindCount} behind</span>` : ''}</h2>
      ${page.matched.length ? `
      <table>
        <thead>
          <tr><th>Stylesheet</th><th>Prod last modified</th><th>Dev last modified</th><th>Status</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>` : ''}
      ${onlyList('Only on prod/QA', page.prodOnly, 'prod')}
      ${onlyList('Only on dev', page.devOnly, 'dev')}
    </section>`;
}

export function renderHtmlReport(result) {
  const totalBehind = result.pages.reduce(
    (sum, p) => sum + p.matched.filter((m) => m.verdict === 'behind').length,
    0,
  );

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Stylesheet sync report</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  :root {
    color-scheme: light dark;
    --bg: #ffffff;
    --fg: #1b1b1f;
    --muted: #6b7280;
    --border: #e5e7eb;
    --surface: #f9fafb;
    --ok-bg: #dcfce7; --ok-fg: #166534;
    --behind-bg: #fee2e2; --behind-fg: #991b1b;
    --unknown-bg: #f3f4f6; --unknown-fg: #4b5563;
    --ahead-bg: #fef9c3; --ahead-fg: #854d0e;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #15161a; --fg: #e5e7eb; --muted: #9ca3af;
      --border: #2a2c33; --surface: #1c1d22;
      --ok-bg: #14321f; --ok-fg: #86efac;
      --behind-bg: #3a1414; --behind-fg: #fca5a5;
      --unknown-bg: #26272e; --unknown-fg: #9ca3af;
      --ahead-bg: #3a3012; --ahead-fg: #fde047;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 2.5rem 1.5rem 4rem;
    background: var(--bg);
    color: var(--fg);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    line-height: 1.5;
  }
  main { max-width: 960px; margin: 0 auto; }
  h1 { font-size: 1.5rem; margin: 0 0 0.25rem; }
  .meta { color: var(--muted); font-size: 0.875rem; margin-bottom: 0.25rem; word-break: break-all; }
  .summary {
    margin: 1.5rem 0 2rem;
    padding: 0.875rem 1rem;
    border-radius: 8px;
    background: var(--surface);
    border: 1px solid var(--border);
    font-size: 0.9375rem;
  }
  .page-block { margin-bottom: 2.5rem; }
  h2 {
    font-size: 1.0625rem;
    border-bottom: 1px solid var(--border);
    padding-bottom: 0.5rem;
    margin-bottom: 0.75rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .count-flag {
    font-size: 0.6875rem;
    font-weight: 600;
    background: var(--behind-bg);
    color: var(--behind-fg);
    padding: 0.125rem 0.5rem;
    border-radius: 999px;
  }
  .empty { color: var(--muted); font-style: italic; font-size: 0.9375rem; }
  table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
  th, td { text-align: left; padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--border); vertical-align: top; }
  th { color: var(--muted); font-weight: 600; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.03em; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.875em; }
  .badge {
    display: inline-block;
    padding: 0.1875rem 0.625rem;
    border-radius: 999px;
    font-size: 0.75rem;
    font-weight: 600;
    white-space: nowrap;
  }
  .badge-ok { background: var(--ok-bg); color: var(--ok-fg); }
  .badge-behind { background: var(--behind-bg); color: var(--behind-fg); }
  .badge-ahead { background: var(--ahead-bg); color: var(--ahead-fg); }
  .badge-differs { background: var(--unknown-bg); color: var(--unknown-fg); }
  tr.verdict-behind { background: color-mix(in srgb, var(--behind-bg) 35%, transparent); }
  .src { color: var(--muted); font-size: 0.8em; }
  .only-list { margin-top: 0.75rem; font-size: 0.875rem; color: var(--muted); }
  .only-list ul { margin: 0.25rem 0 0; padding-left: 1.25rem; }
  .only-list code { color: var(--fg); }
  .only-list .hint { margin: 0.5rem 0 0; font-size: 0.8125rem; font-style: italic; }
</style>
</head>
<body>
<main>
  <h1>Stylesheet sync report</h1>
  <div class="meta">Prod/QA: ${escapeHtml(result.prodUrl)}</div>
  <div class="meta">Dev: ${escapeHtml(result.devUrl)}</div>
  ${result.repoPath ? `<div class="meta">Repo (for dev dates): ${escapeHtml(result.repoPath)}</div>` : ''}
  <div class="meta">Generated ${fmtDate(result.generatedAt)}</div>

  <div class="summary">
    ${totalBehind === 0
      ? 'All matched stylesheets on prod/QA are in sync with dev.'
      : `<strong>${totalBehind}</strong> stylesheet${totalBehind === 1 ? ' is' : 's are'} behind on prod/QA compared to dev.`}
  </div>

  ${result.pages.map(pageSection).join('\n')}
</main>
</body>
</html>`;
}

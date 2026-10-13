#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { runComparison } from './lib/compareStylesheets.js';
import { renderHtmlReport } from './lib/report.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const REPORTS_DIR = join(ROOT, 'reports');

function parseArgs(argv) {
  const args = { pages: null, open: true, reportOnly: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--prod') args.prodUrl = argv[++i];
    else if (arg === '--dev') args.devUrl = argv[++i];
    else if (arg === '--pages') args.pages = argv[++i].split(',').map((p) => p.trim()).filter(Boolean);
    else if (arg === '--repo') args.repoPath = argv[++i];
    else if (arg === '--no-open') args.open = false;
    else if (arg === '--report-only') args.reportOnly = true;
  }
  return args;
}

async function loadConfig() {
  const configPath = join(ROOT, 'config.js');
  if (!existsSync(configPath)) return {};
  return import(pathToFileURL(configPath).href);
}

function openInBrowser(filePath) {
  const url = pathToFileURL(filePath).href;
  const platform = process.platform;
  const cmd = platform === 'darwin' ? 'open' : platform === 'win32' ? 'start' : 'xdg-open';
  const cmdArgs = platform === 'win32' ? ['""', url] : [url];
  spawn(cmd, cmdArgs, { shell: platform === 'win32', stdio: 'ignore', detached: true }).unref();
}

function latestReportDir() {
  if (!existsSync(REPORTS_DIR)) return null;
  const dirs = readdirSync(REPORTS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  return dirs.length ? join(REPORTS_DIR, dirs[dirs.length - 1]) : null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.reportOnly) {
    const dir = latestReportDir();
    if (!dir) {
      console.error('No existing reports found in reports/. Run without --report-only first.');
      process.exit(1);
    }
    const result = JSON.parse(readFileSync(join(dir, 'report.json'), 'utf8'));
    const htmlPath = join(dir, 'report.html');
    writeFileSync(htmlPath, renderHtmlReport(result));
    console.log(`Rebuilt ${htmlPath}`);
    if (args.open) openInBrowser(htmlPath);
    return;
  }

  const config = await loadConfig();

  const prodUrl = args.prodUrl ?? config.prodUrl;
  const devUrl = args.devUrl ?? config.devUrl ?? 'http://localhost:3000';
  const pages = args.pages ?? config.pages;
  const repoPath = args.repoPath ?? config.repoPath ?? null;

  if (!prodUrl) {
    console.error(
      'Missing prod/QA URL. Pass --prod <url>, or set prodUrl in config.js (copy config.example.js).',
    );
    process.exit(1);
  }
  if (!pages || pages.length === 0) {
    console.error(
      'Missing page list. Pass --pages /,/foo,/bar, or set pages in config.js (copy config.example.js).',
    );
    process.exit(1);
  }

  console.log(`Prod/QA: ${prodUrl}`);
  console.log(`Dev:     ${devUrl}`);
  console.log(`Pages:   ${pages.join(', ')}`);
  if (repoPath) console.log(`Repo:    ${repoPath} (using git commit dates for dev)`);
  else if (/^https?:\/\/(localhost|127\.0\.0\.1)/.test(devUrl)) {
    console.log(
      'Warning: dev looks like a local server but no --repo was given. '
      + 'Local file timestamps reflect checkout time, not commit time, and can produce false positives. '
      + 'Pass --repo <path-to-local-checkout> for accurate results.',
    );
  }
  console.log('Checking...');

  const result = await runComparison({
    prodUrl, devUrl, pages, repoPath,
  });

  const stamp = result.generatedAt.replace(/[:.]/g, '-');
  const outDir = join(REPORTS_DIR, stamp);
  mkdirSync(outDir, { recursive: true });

  writeFileSync(join(outDir, 'report.json'), JSON.stringify(result, null, 2));
  const htmlPath = join(outDir, 'report.html');
  writeFileSync(htmlPath, renderHtmlReport(result));

  const totalBehind = result.pages.reduce(
    (sum, p) => sum + p.matched.filter((m) => m.verdict === 'behind').length,
    0,
  );
  console.log(`\nDone. ${totalBehind} stylesheet(s) behind.`);
  console.log(`Report: ${htmlPath}`);

  if (args.open) openInBrowser(htmlPath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

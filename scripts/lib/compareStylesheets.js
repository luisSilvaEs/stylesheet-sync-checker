import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { discoverStylesheetsOnPage, withBrowser } from './discoverStylesheets.js';
import { matchStylesheets } from './matchStylesheets.js';

const execFileAsync = promisify(execFile);

function isLocalhost(url) {
  try {
    const { hostname } = new URL(url);
    return hostname === 'localhost' || hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

/**
 * Local file mtimes reflect when a repo was last checked out/pulled, not
 * when the file's content last actually changed. When the dev target is
 * localhost, a repoPath is configured, and the URL's path happens to map
 * directly onto a file on disk (true for EDS's unhashed /blocks/ paths;
 * not generally true for hashed bundler output), use git's commit date
 * for that file instead — the real source of truth.
 */
async function gitDateForDevFile(repoPath, pathname) {
  const relPath = pathname.replace(/^\/+/, '');
  if (!existsSync(join(repoPath, relPath))) return null;
  try {
    const { stdout } = await execFileAsync(
      'git', ['-C', repoPath, 'log', '-1', '--format=%cI', '--', relPath],
    );
    const iso = stdout.trim();
    if (!iso) return null;
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

/**
 * Deploys aren't instant — a prod/QA sync job can legitimately lag dev by
 * some amount of time without anything actually being "behind." toleranceMs
 * absorbs that normal lag: a gap within tolerance is still reported as "ok".
 */
function verdictFor({ prod, dev, sameFile }, toleranceMs) {
  if (sameFile && prod.status === 200 && dev.status === 200) return 'ok';
  if (prod.lastModified && dev.lastModified) {
    const diffMs = dev.lastModified.getTime() - prod.lastModified.getTime();
    if (Math.abs(diffMs) <= toleranceMs) return 'ok';
    return diffMs > 0 ? 'behind' : 'ahead';
  }
  // Different hashed filename but no usable dates to confirm direction.
  return 'differs';
}

const DEFAULT_TOLERANCE_HOURS = 12;

/**
 * Runs the full comparison across every configured page.
 */
export async function runComparison({
  prodUrl, devUrl, pages, repoPath = null, toleranceHours = DEFAULT_TOLERANCE_HOURS,
}) {
  const toleranceMs = toleranceHours * 60 * 60 * 1000;
  const useGitForDev = Boolean(repoPath) && isLocalhost(devUrl);
  const results = [];

  await withBrowser(async (browser) => {
    for (const path of pages) {
      const [prodResult, devResult] = await Promise.all([
        discoverStylesheetsOnPage(browser, prodUrl, path),
        discoverStylesheetsOnPage(browser, devUrl, path),
      ]);

      const { matched, prodOnly, devOnly } = matchStylesheets(
        prodResult.stylesheets,
        devResult.stylesheets,
      );

      const comparedMatches = await Promise.all(matched.map(async (m) => {
        let { dev } = m;
        let devDateSource = 'http';
        if (useGitForDev) {
          const gitDate = await gitDateForDevFile(repoPath, new URL(dev.url).pathname);
          if (gitDate) {
            dev = { ...dev, lastModified: gitDate };
            devDateSource = 'git';
          }
        }
        return { ...m, dev, devDateSource, verdict: verdictFor({ ...m, dev }, toleranceMs) };
      }));

      results.push({
        path,
        prodPageStatus: prodResult.pageStatus,
        devPageStatus: devResult.pageStatus,
        matched: comparedMatches,
        prodOnly,
        devOnly,
      });
    }
  });

  return {
    generatedAt: new Date().toISOString(),
    prodUrl,
    devUrl,
    repoPath,
    toleranceHours,
    pages: results,
  };
}

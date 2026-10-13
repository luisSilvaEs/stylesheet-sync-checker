import { chromium } from 'playwright';
import { joinUrl } from './fetchUtils.js';

/**
 * Loads a page in headless Chromium and captures every network response
 * that was actually requested as a stylesheet — this catches both static
 * <link> tags and stylesheets injected by client-side JS after load (e.g.
 * lazy-loaded EDS block CSS), which a plain HTML fetch would miss.
 *
 * Returns { pageStatus, stylesheets: [{ url, status, lastModified }] }
 */
export async function discoverStylesheetsOnPage(browser, baseUrl, path, { timeout = 20000 } = {}) {
  const context = await browser.newContext();
  const page = await context.newPage();

  const sheets = new Map(); // url -> { url, status, lastModified }
  page.on('response', (response) => {
    if (response.request().resourceType() !== 'stylesheet') return;
    const url = response.url();
    const headers = response.headers();
    sheets.set(url, {
      url,
      status: response.status(),
      lastModified: headers['last-modified'] ?? null,
    });
  });

  let pageStatus = null;
  try {
    const nav = await page.goto(joinUrl(baseUrl, path), { waitUntil: 'load', timeout });
    pageStatus = nav?.status() ?? null;
    // Give lazy-loaded (client-side injected) stylesheets a chance to fire.
    await page.waitForLoadState('networkidle', { timeout }).catch(() => {});
  } catch (err) {
    pageStatus = pageStatus ?? `error: ${err.message}`;
  } finally {
    await context.close();
  }

  return {
    pageStatus,
    stylesheets: [...sheets.values()].map((s) => ({
      ...s,
      lastModified: s.lastModified ? parseHttpDate(s.lastModified) : null,
    })),
  };
}

function parseHttpDate(raw) {
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function withBrowser(fn) {
  const browser = await chromium.launch();
  try {
    return await fn(browser);
  } finally {
    await browser.close();
  }
}

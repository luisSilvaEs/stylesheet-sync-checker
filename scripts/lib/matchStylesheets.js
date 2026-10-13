// Matches bundler-hashed content: name.a1b2c3d4.css, name-4f3a9c2.css, etc.
// Deliberately conservative (hex only) to avoid stripping real words like
// "v2" or "min" from filenames.
const HASH_TOKEN_RE = /^[a-f0-9]{6,40}$/i;

/**
 * Reduces a stylesheet URL to a path with any build-hash segment in the
 * filename stripped out, so the same logical file can be matched across two
 * environments even when its hashed filename differs between builds.
 *   /assets/main.a1b2c3d4.css  ->  /assets/main.css
 *   /blocks/hero/hero.css      ->  /blocks/hero/hero.css   (unchanged)
 */
export function stylesheetStem(url) {
  const { pathname } = new URL(url);
  const lastSlash = pathname.lastIndexOf('/');
  const dir = pathname.slice(0, lastSlash + 1);
  const filename = pathname.slice(lastSlash + 1);

  const dot = filename.lastIndexOf('.');
  if (dot === -1) return pathname;
  const ext = filename.slice(dot + 1);
  const base = filename.slice(0, dot);

  const tokens = base.split(/[.-]/).filter((t) => !HASH_TOKEN_RE.test(t));
  const stemBase = tokens.length ? tokens.join('.') : base;
  return `${dir}${stemBase}.${ext}`;
}

/**
 * Pairs up prod and dev stylesheets by stem. Returns:
 *   matched: [{ stem, prod, dev, sameFile }]
 *   prodOnly: [stylesheet, ...]   -- present on prod, no dev counterpart found
 *   devOnly: [stylesheet, ...]    -- present on dev, no prod counterpart found
 */
export function matchStylesheets(prodSheets, devSheets) {
  const devByStem = new Map();
  for (const sheet of devSheets) {
    const stem = stylesheetStem(sheet.url);
    if (!devByStem.has(stem)) devByStem.set(stem, sheet);
  }

  const matched = [];
  const prodOnly = [];
  const usedDevStems = new Set();

  for (const prod of prodSheets) {
    const stem = stylesheetStem(prod.url);
    const dev = devByStem.get(stem);
    if (dev) {
      matched.push({ stem, prod, dev, sameFile: prod.url === dev.url });
      usedDevStems.add(stem);
    } else {
      prodOnly.push(prod);
    }
  }

  const devOnly = devSheets.filter((sheet) => !usedDevStems.has(stylesheetStem(sheet.url)));

  return { matched, prodOnly, devOnly };
}

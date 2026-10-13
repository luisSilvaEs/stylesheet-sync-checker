// Copy to config.js (gitignored) and edit, or just pass flags to override:
//   node scripts/run.js --prod https://example.com --dev http://localhost:3000 --pages /,/research/

// QA/prod domain to check for stale CSS.
export const prodUrl = 'https://main--example-site--example.aem.page';

// Domain with the current/expected code. Defaults to http://localhost:3000 if omitted.
export const devUrl = 'http://localhost:3000';

// Page paths to inspect. Each page is scanned for which blocks it renders.
export const pages = [
  '/',
  '/research/',
  '/workflows/',
  '/sneaks/',
  '/playground/',
  '/policy/',
  '/docs/reference/article',
];

// Optional, but strongly recommended whenever devUrl points at localhost.
// Path to the local checkout backing the dev server. Local file timestamps
// reflect when the repo was last checked out, not when a file's content was
// actually last changed, so comparing them directly to a real deploy's
// Last-Modified produces false positives. When set, dev dates are read from
// `git log` in this path instead.
export const repoPath = undefined; // e.g. '/Users/you/code/your-eds-site'

// Optional. How many hours of lag between prod/QA and dev to tolerate before
// flagging a stylesheet as "behind". Deploy/sync jobs aren't instant, so a
// small gap doesn't necessarily mean anything is actually wrong. Defaults
// to 12 if omitted.
export const toleranceHours = 12;

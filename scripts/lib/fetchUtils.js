export function joinUrl(base, path) {
  return new URL(path.replace(/^\/+/, ''), base.endsWith('/') ? base : `${base}/`).toString();
}

export function paymentOrigin(value: string | undefined, production: boolean, port = "4100") {
  if (!value?.trim() && production) throw new Error("PUBLIC_SITE_URL is required in production.");
  const url = new URL(value?.trim() || `http://localhost:${port}`);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error("PUBLIC_SITE_URL must be an HTTP(S) origin.");
  }
  if (production && (url.protocol !== 'https:' || ['localhost','127.0.0.1','[::1]'].includes(url.hostname) || url.hostname.endsWith('.localhost'))) {
    throw new Error("PUBLIC_SITE_URL must be a public HTTPS origin in production.");
  }
  return url.origin;
}

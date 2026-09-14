/**
 * PROXY_TARGET_URL names the remote application's public base, not its /api endpoint.
 * Validate it before dev hooks run so an invalid target cannot start a local backend.
 * @param {string | undefined} value
 * @returns {URL | undefined}
 */
export function parseProxyTarget(value) {
  const normalized = value?.trim();
  if (!normalized) return undefined;
  let target;
  try {
    target = new URL(normalized);
  } catch {
    throw new Error(
      'PROXY_TARGET_URL must be an absolute HTTP(S) application URL.',
    );
  }
  if (
    !['http:', 'https:'].includes(target.protocol) ||
    target.username ||
    target.password ||
    target.search ||
    target.hash
  ) {
    throw new Error(
      'PROXY_TARGET_URL must be an HTTP(S) application URL without credentials, query, or fragment.',
    );
  }
  return target;
}

/**
 * Keep browser requests on the local Vite origin while mapping API and realtime
 * paths to the remote application, whose public base may differ from ours.
 * @param {string} appBase
 * @param {string | undefined} value
 * @returns {Record<string, import('vite').ProxyOptions> | undefined}
 */
export function createDevProxy(appBase, value) {
  const target = parseProxyTarget(value);
  if (!target) return undefined;
  const localBase = '/' + appBase.trim().replace(/^\/+|\/+$/g, '');
  const localPrefix = localBase === '/' ? '' : localBase;
  const remotePrefix = target.pathname.replace(/\/+$/, '');
  const escapedPrefix = localPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const options = {
    target: target.origin,
    changeOrigin: true,
    rewrite: (/** @type {string} */ requestPath) =>
      remotePrefix + requestPath.slice(localPrefix.length),
    // Remote cookie scopes must point at the browser's local application.
    cookieDomainRewrite: '',
    cookiePathRewrite: localPrefix + '/',
  };
  return {
    [`^${escapedPrefix}/api(?=/|\\?|$)`]: { ...options },
    [`^${escapedPrefix}/ws(?=/|\\?|$)`]: { ...options, ws: true },
  };
}

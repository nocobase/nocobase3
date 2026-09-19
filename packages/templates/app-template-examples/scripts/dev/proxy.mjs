import { TLSSocket } from 'node:tls';

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
  /**
   * Adapt browser requests from this local origin without making unrelated
   * origins trusted. Use the actual transport and Host, not forwarded headers.
   * @param {import('node:http').ClientRequest} proxyRequest
   * @param {import('node:http').IncomingMessage} request
   */
  const rewriteBrowserOrigin = (proxyRequest, request) => {
    const host = request.headers.host;
    if (!host) return;
    const protocol =
      request.socket instanceof TLSSocket && request.socket.encrypted
        ? 'https:'
        : 'http:';
    let localOrigin;
    try {
      localOrigin = new URL(`${protocol}//${host}`).origin;
    } catch {
      return;
    }
    const origin = request.headers.origin;
    if (origin !== undefined && origin !== localOrigin) return;
    if (origin !== undefined) proxyRequest.setHeader('origin', target.origin);

    // Better Auth can fall back to Referer when Origin is absent. Keep that
    // fallback on the same remote app without adding an Origin to the request.
    const referer = request.headers.referer;
    if (!referer) return;
    let refererUrl;
    try {
      refererUrl = new URL(referer);
    } catch {
      return;
    }
    if (refererUrl.origin !== localOrigin) return;
    if (
      refererUrl.pathname !== localPrefix &&
      !refererUrl.pathname.startsWith(localPrefix + '/')
    )
      return;
    proxyRequest.setHeader(
      'referer',
      target.origin +
        remotePrefix +
        refererUrl.pathname.slice(localPrefix.length) +
        refererUrl.search,
    );
  };
  /** @type {import('vite').ProxyOptions} */
  const options = {
    target: target.origin,
    changeOrigin: true,
    rewrite: (/** @type {string} */ requestPath) =>
      remotePrefix + requestPath.slice(localPrefix.length),
    // Remote cookie scopes must point at the browser's local application.
    cookieDomainRewrite: '',
    cookiePathRewrite: localPrefix + '/',
    configure(proxy) {
      proxy.on('proxyReq', rewriteBrowserOrigin);
      proxy.on('proxyReqWs', rewriteBrowserOrigin);
    },
  };
  return {
    [`^${escapedPrefix}/api(?=/|\\?|$)`]: { ...options },
    [`^${escapedPrefix}/ws(?=/|\\?|$)`]: { ...options, ws: true },
  };
}

import { Hono } from "hono";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

import { Auth } from "@nocobase/authentication";
import type { AppRuntimeRegistry } from "@nocobase/app-host";

import { createHubApi } from "./hub/api.js";
import { createHubDatabase, type HubDatabaseRuntime } from "./hub/database.js";

export interface CreateAppOptions {
  appName?: string;
  basePath?: string;
  browserBasePath?: string;
  browserApiUrl?: string;
  apiProxyPath?: string;
  clientHandler?: ClientHandler;
  clientIndexPath?: string;
  nocoBaseApiUrl?: string | false;
  apiClientStoragePrefix?: string;
  apiClientStorageType?: string;
  apiClientShareToken?: boolean;
  /** Enable the self-contained Hub control plane (enabled when auth is configured). */
  hub?: boolean;
  databasePath?: string;
  authSecret?: string;
  authBaseUrl?: string;
  releaseRoot?: string;
  appHostRegistry?: AppRuntimeRegistry;
}

export type ClientHandler = (request: Request) => Response | Promise<Response>;

export interface HubApp extends Hono {
  readonly hubReady?: Promise<void>;
  close?(): Promise<void>;
}

export function createApp(options: CreateAppOptions = {}): HubApp {
  const appName = resolveAppName(options.appName);
  const basePath = resolveBasePath(options.basePath, appName);
  const browserBasePath = resolveBrowserBasePath(
    options.browserBasePath,
    basePath,
  );
  const apiProxyPath = resolveApiProxyPath(options.apiProxyPath);
  const nocoBaseApiUrl = resolveNocoBaseApiUrl(options.nocoBaseApiUrl);
  if (apiProxyPath !== undefined && nocoBaseApiUrl) {
    assertApiProxyPathDoesNotOverlapHubApi(apiProxyPath, basePath);
  }
  const browserApiUrl =
    options.browserApiUrl ?? joinBasePath(browserBasePath, "/api");
  const clientHandler = options.clientHandler;
  const clientIndexPath =
    options.clientIndexPath ?? path.resolve(process.cwd(), "index.html");
  const clientRootDir = path.dirname(clientIndexPath);
  const app = new Hono();

  app.get("/healthz", (context) => {
    return context.json({
      ok: true,
      app: {
        name: appName,
        basePath: browserBasePath,
      },
    });
  });

  if (apiProxyPath && nocoBaseApiUrl) {
    app.all(apiProxyPath, (context) =>
      proxyToNocoBaseApi(context.req.raw, apiProxyPath, nocoBaseApiUrl),
    );
    app.all(`${apiProxyPath}/*`, (context) =>
      proxyToNocoBaseApi(context.req.raw, apiProxyPath, nocoBaseApiUrl),
    );
  }

  const api = new Hono();
  const authSecret = options.authSecret ?? process.env.AUTH_SECRET;
  const hubEnabled = options.hub ?? Boolean(authSecret || options.databasePath);
  let hubRuntime: HubDatabaseRuntime | undefined;
  let hubReady: Promise<void> | undefined;
  let closeHubApi: (() => Promise<void>) | undefined;

  if (hubEnabled) {
    if (!authSecret || authSecret.trim().length < 32) {
      throw new Error(
        "AUTH_SECRET must contain at least 32 characters when Hub is enabled.",
      );
    }
    hubRuntime = createHubDatabase({
      filename: options.databasePath ?? process.env.HUB_DATABASE_PATH,
    });
    const configuredAuthBaseUrl = options.authBaseUrl?.trim();
    const authUrl = new URL(
      configuredAuthBaseUrl ||
        `http://localhost${joinBasePath(basePath, "/api/auth")}`,
    );
    const authOptions = {
      connection: hubRuntime.connection,
      baseURL: authUrl.origin,
      basePath: normalizeBasePath(authUrl.pathname),
      trustedOrigins: configuredAuthBaseUrl
        ? undefined
        : [
            "http://localhost:*",
            "http://127.0.0.1",
            "http://127.0.0.1:*",
            "http://[::1]",
            "http://[::1]:*",
          ],
      secret: authSecret,
      appName,
      session: {
        storeSessionInDatabase: true,
      },
      advanced: {
        cookiePrefix: "hub",
        disableOriginCheck: false,
        defaultCookieAttributes: { path: browserBasePath || "/" },
      },
    } as const;
    const auth = new Auth({
      ...authOptions,
      emailAndPassword: {
        enabled: true,
        autoSignIn: false,
        disableSignUp: true,
      },
    });
    const bootstrapAuth = new Auth({
      ...authOptions,
      emailAndPassword: {
        enabled: true,
        autoSignIn: false,
      },
    });
    const hubApi = createHubApi({
      database: hubRuntime,
      auth,
      bootstrapAuth,
      appName,
      publicBasePath: browserBasePath,
      authoritativeOrigin: configuredAuthBaseUrl ? authUrl.origin : undefined,
      registry: options.appHostRegistry,
      releaseRoot: options.releaseRoot,
    });
    api.route("/", hubApi);
    hubReady = hubApi.ready;
    closeHubApi = () => hubApi.close();
  } else {
    api.get("/healthz", (context) => {
      return context.json({
        ok: true,
        app: {
          name: appName,
          basePath: browserBasePath,
        },
        basePath: browserBasePath,
      });
    });
    api.get("/apps", (context) =>
      context.json({
        data: [],
        meta: { total: 0 },
        requestId: crypto.randomUUID(),
      }),
    );
  }

  app.route(`${basePath}/api`, api);
  if (clientHandler) {
    app.all(basePath || "/", (context) =>
      dispatchClientRoute(context.req.raw, basePath, clientHandler),
    );
    app.all(`${basePath}/*`, (context) =>
      dispatchClientRoute(context.req.raw, basePath, clientHandler),
    );
  } else {
    app.all(`${basePath}/assets`, (context) =>
      serveClientAsset(context.req.raw, clientRootDir, basePath),
    );
    app.all(`${basePath}/assets/*`, (context) =>
      serveClientAsset(context.req.raw, clientRootDir, basePath),
    );
    app.get(basePath || "/", (context) =>
      dispatchClientRoute(context.req.raw, basePath, () =>
        serveClient(clientIndexPath, {
          appBasePath: browserBasePath,
          apiUrl: browserApiUrl,
          storagePrefix: options.apiClientStoragePrefix,
          storageType: options.apiClientStorageType,
          shareToken: options.apiClientShareToken,
        }),
      ),
    );
    app.get(`${basePath}/*`, (context) =>
      dispatchClientRoute(context.req.raw, basePath, () =>
        serveClient(clientIndexPath, {
          appBasePath: browserBasePath,
          apiUrl: browserApiUrl,
          storagePrefix: options.apiClientStoragePrefix,
          storageType: options.apiClientStorageType,
          shareToken: options.apiClientShareToken,
        }),
      ),
    );
  }

  let closePromise: Promise<void> | undefined;
  const mounted = Object.assign(app, {
    hubReady,
    close: (): Promise<void> =>
      (closePromise ??= (async (): Promise<void> => {
        await hubReady?.catch(() => undefined);
        await closeHubApi?.();
        await hubRuntime?.close();
      })()),
  });
  return mounted;
}

function dispatchClientRoute(
  request: Request,
  basePath: string,
  handler: ClientHandler,
): Response | Promise<Response> {
  const pathInsideClient = getPathInsideClient(
    new URL(request.url).pathname,
    basePath,
  );
  if (/^\/(?:v\d+\/)?api(?:\/|$)/.test(pathInsideClient)) {
    return notFound();
  }
  return handler(request);
}

function resolveAppName(value: string | undefined): string {
  const normalized = value?.trim() || "app";
  return normalized.replace(/^\/+|\/+$/g, "") || "app";
}

function resolveBasePath(value: string | undefined, appName: string): string {
  return normalizeBasePath(value ?? `/${appName}`);
}

function resolveBrowserBasePath(
  value: string | undefined,
  basePath: string,
): string {
  return normalizeBasePath(value ?? basePath);
}

function resolveApiProxyPath(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  try {
    const url = new URL(value);
    return normalizeBasePath(url.pathname);
  } catch {
    return normalizeBasePath(value);
  }
}

function assertApiProxyPathDoesNotOverlapHubApi(
  apiProxyPath: string,
  basePath: string,
): void {
  const hubApiPath = joinBasePath(basePath, "/api");
  if (
    pathContains(apiProxyPath, hubApiPath) ||
    pathContains(hubApiPath, apiProxyPath)
  ) {
    throw new Error(
      `NocoBase API proxy path "${apiProxyPath || "/"}" must not overlap the Hub API path "${hubApiPath}".`,
    );
  }
}

function pathContains(parent: string, child: string): boolean {
  return parent === "" || child === parent || child.startsWith(`${parent}/`);
}

export function normalizeBasePath(value: string): string {
  const normalized = value.trim().replace(/^\/+|\/+$/g, "");
  return normalized ? `/${normalized}` : "";
}

export function joinBasePath(basePath: string, pathInsideBase: string): string {
  const normalizedBasePath = normalizeBasePath(basePath);
  const normalizedPath = normalizeBasePath(pathInsideBase);
  return `${normalizedBasePath}${normalizedPath}` || "/";
}

function resolveNocoBaseApiUrl(
  value: string | false | undefined,
): URL | undefined {
  if (value === false) {
    return undefined;
  }

  const raw = value;
  const normalized = raw?.trim();
  if (!normalized || normalized === "false" || normalized === "0") {
    return undefined;
  }

  return new URL(normalized);
}

async function proxyToNocoBaseApi(
  request: Request,
  apiProxyPath: string,
  nocoBaseApiUrl: URL | undefined,
): Promise<Response> {
  if (!nocoBaseApiUrl) {
    return Response.json(
      {
        error: "NocoBase API proxy target is not configured.",
      },
      {
        status: 503,
      },
    );
  }

  const targetUrl = createApiTargetUrl(request, apiProxyPath, nocoBaseApiUrl);

  return proxyRequest(request, targetUrl, {
    headers: createNocoBaseApiProxyHeaders(
      request,
      apiProxyPath,
      nocoBaseApiUrl,
    ),
    unavailableMessage: "NocoBase API server is unavailable.",
  });
}

function createApiTargetUrl(
  request: Request,
  apiProxyPath: string,
  nocoBaseApiUrl: URL,
): URL {
  const requestUrl = new URL(request.url);
  const normalizedProxyPath = apiProxyPath.replace(/\/$/, "");
  const apiBasePath = nocoBaseApiUrl.pathname.replace(/\/$/, "");
  const suffix = requestUrl.pathname
    .slice(normalizedProxyPath.length)
    .replace(/^\/+/, "");
  const pathname = suffix ? `${apiBasePath}/${suffix}` : apiBasePath || "/";
  const targetUrl = new URL(nocoBaseApiUrl);
  targetUrl.pathname = pathname;
  targetUrl.search = requestUrl.search;
  return targetUrl;
}

async function proxyRequest(
  request: Request,
  targetUrl: URL,
  {
    headers = new Headers(request.headers),
    unavailableMessage,
  }: {
    headers?: Headers;
    unavailableMessage: string;
  },
): Promise<Response> {
  headers.set("host", targetUrl.host);
  headers.set("accept-encoding", "identity");
  removeHopByHopHeaders(headers);

  try {
    const response = await fetch(targetUrl, {
      method: request.method,
      headers,
      body:
        request.method === "GET" || request.method === "HEAD"
          ? undefined
          : request.body,
      redirect: "manual",
      duplex: "half",
    } as RequestInit & { duplex: "half" });

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: createProxyResponseHeaders(response.headers),
    });
  } catch (error) {
    console.error("NocoBase API proxy request failed.", {
      error,
      target: targetUrl.href,
    });
    return Response.json(
      {
        error: unavailableMessage,
      },
      {
        status: 502,
      },
    );
  }
}

function createProxyResponseHeaders(headers: Headers): Headers {
  const nextHeaders = new Headers(headers);
  removeHopByHopHeaders(nextHeaders);
  nextHeaders.delete("content-encoding");
  nextHeaders.delete("content-length");
  return nextHeaders;
}

function removeHopByHopHeaders(headers: Headers): void {
  for (const header of [
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
  ]) {
    headers.delete(header);
  }
}

/**
 * Build the headers forwarded to the upstream NocoBase API.
 *
 * The guiding rule: **relay the browser's hop faithfully; do not replace it with this process's own
 * hop to the upstream.** That distinction is what separates a reverse proxy from a client. The
 * upstream reconstructs "which address is the user actually looking at" from these headers, and that
 * address is the site's public origin -- not 127.0.0.1:13000.
 *
 * Sign-in is where this bites. `auth:signIn` validates the request's origin
 * (`assertTrustedSignInOrigin` in core/auth): the `origin` header must equal, verbatim, the
 * requestOrigin the upstream derives as `x-forwarded-proto || protocol` + `x-forwarded-host || host`
 * (core/utils' cors.ts). So all three of the following must point at the site itself; getting any one
 * of them wrong yields `403 Invalid sign-in origin`:
 *
 *   - `origin`            -- forwarded untouched
 *   - `x-forwarded-host`  -- the host the browser addressed
 *   - `x-forwarded-proto` -- the protocol the browser used
 *
 * **A deployment that proxies straight to the upstream cannot be validated by hand against a remote
 * target.** When the proxy target is a public site, the request traverses that site's own reverse
 * proxy on the way out, which overwrites whatever `x-forwarded-*` this function produced. That masks
 * mistakes in the loopback case -- which is why this behaviour is pinned by tests rather than by
 * manual checks.
 *
 * That same overwriting is why the two topologies below need different handling: relaying faithfully
 * is correct only when nothing sits between this process and the upstream.
 */
// Exported for tests only: the cross-site branch requires a non-loopback upstream, and a stub HTTP
// server can only bind loopback -- so that branch cannot be exercised through `createApp`.
export function createNocoBaseApiProxyHeaders(
  request: Request,
  apiProxyPath: string,
  nocoBaseApiUrl: URL,
): Headers {
  const headers = new Headers(request.headers);
  headers.delete("cookie");
  const sourceUrl = new URL(request.url);

  // Cross-site upstream (typically local development, where the proxy target is a shared remote
  // NocoBase). Relaying faithfully is guaranteed to fail here: the browser's origin is
  // `http://127.0.0.1:3000`, but the remote site's own reverse proxy rewrites `x-forwarded-host` to
  // its own hostname, so the upstream derives `https://remote-site` and the two no longer match.
  //
  // Align all three at the upstream site instead. They have to agree with each other; which site
  // they agree on is the only question, and the upstream can only ever see itself.
  if (isCrossSiteUpstream(nocoBaseApiUrl)) {
    headers.set("x-forwarded-host", nocoBaseApiUrl.host);
    headers.set("x-forwarded-proto", nocoBaseApiUrl.protocol.replace(/:$/, ""));

    // Only rewrite what the browser actually sent. A request without `origin` (curl, server-side
    // calls) does not trigger the origin check at all; inventing one would turn "no origin declared"
    // into "claims to come from the site itself", a strictly stronger assertion that a proxy has no
    // business making on the caller's behalf.
    if (headers.has("origin")) {
      headers.set("origin", nocoBaseApiUrl.origin);
    }

    if (headers.has("referer")) {
      headers.set("referer", `${nocoBaseApiUrl.origin}/`);
    }

    headers.set("x-forwarded-prefix", apiProxyPath);

    return headers;
  }

  // Same-site upstream (production: this process and the upstream are the same site, reached over
  // loopback). Relay the browser's hop as-is.
  //
  // This process may itself sit behind a reverse proxy that terminates TLS and connects onward in
  // cleartext. In that case these two headers already carry the browser's real hop and must be left
  // alone -- overwriting them with this connection's details reports an https site as http, which
  // fails the sign-in origin check. Only fill them in when nothing upstream has.
  //
  // Note the protocol cannot come from `request.url`: the scheme there is derived from whether this
  // socket is encrypted, and behind a TLS-terminating proxy that is always plain http.
  if (!headers.has("x-forwarded-host")) {
    headers.set("x-forwarded-host", headers.get("host") ?? sourceUrl.host);
  }

  if (!headers.has("x-forwarded-proto")) {
    headers.set("x-forwarded-proto", sourceUrl.protocol.replace(/:$/, ""));
  }

  headers.set("x-forwarded-prefix", apiProxyPath);

  // `origin` and `referer` are forwarded as-is, deliberately.

  return headers;
}

/**
 * Is the upstream a *different site*, rather than a NocoBase process on this same host?
 *
 * This decides how the forwarded headers are built, and getting it wrong shows up only as
 * `403 Invalid sign-in origin` at sign-in -- several layers removed from the cause.
 *
 * **Production**: `NOCOBASE_API_PROXY_TARGET` is a loopback address. This process and the upstream
 * are the same site with nothing in between, so the browser's hop relays through unchanged.
 *
 * **Local development**: the target is a shared remote NocoBase. The request has to traverse that
 * site's reverse proxy, which rewrites `x-forwarded-*` to its own hostname -- so relaying the
 * browser's `http://127.0.0.1:3000` verbatim can never match what the upstream derives.
 *
 * The test is "is the upstream on loopback", not `NODE_ENV`, because the real question is whether
 * the upstream is the same site as this process -- not whether we happen to be in dev mode. Keying
 * off `NODE_ENV` would leave any production deployment that proxies to a remote upstream broken in
 * exactly the same way.
 *
 * `new URL` normalises the exotic loopback spellings (`0177.0.0.1`, `2130706433`, `127.1`) to
 * `127.0.0.1`, so matching the literal forms below is sufficient.
 */
function isCrossSiteUpstream(nocoBaseApiUrl: URL): boolean {
  return !/^(127\.0\.0\.1|localhost|\[::1\]|::1)$/i.test(
    nocoBaseApiUrl.hostname,
  );
}

interface ClientRuntimeConfig {
  appBasePath: string;
  apiUrl: string;
  storagePrefix?: string;
  storageType?: string;
  shareToken?: boolean;
}

const oneYearSeconds = 31_536_000;
const runtimeConfigStartMarker = "<!-- nocobase-runtime-config:start -->";
const runtimeConfigEndMarker = "<!-- nocobase-runtime-config:end -->";
const contentTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".wasm": "application/wasm",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

async function serveClientAsset(
  request: Request,
  clientRootDir: string,
  basePath: string,
): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return methodNotAllowed("GET, HEAD");
  }

  const requestUrl = new URL(request.url);
  const pathInsideClient = getPathInsideClient(requestUrl.pathname, basePath);
  const response = await serveFileIfExists(
    clientRootDir,
    pathInsideClient,
    request.method,
    {
      cacheControl: `public, max-age=${oneYearSeconds}, immutable`,
    },
  );

  return response ?? notFound();
}

async function serveClient(
  clientIndexPath: string,
  runtimeConfig: ClientRuntimeConfig,
): Promise<Response> {
  const html = await readFile(clientIndexPath, "utf8");
  return new Response(injectRuntimeConfig(html, runtimeConfig), {
    headers: {
      "cache-control": "no-cache",
      "content-type": "text/html; charset=utf-8",
    },
  });
}

function injectRuntimeConfig(
  html: string,
  runtimeConfig: ClientRuntimeConfig,
): string {
  const cleanHtml = stripExistingRuntimeConfig(html);
  const moduleScriptPattern = /<script\s+[^>]*type=["']module["'][^>]*>/i;
  const moduleScriptMatch = cleanHtml.match(moduleScriptPattern);
  const configHtml = createRuntimeConfigHtml(runtimeConfig);

  if (moduleScriptMatch?.index === undefined) {
    return `${cleanHtml}\n${configHtml}`;
  }

  return `${cleanHtml.slice(0, moduleScriptMatch.index)}${configHtml}${cleanHtml.slice(moduleScriptMatch.index)}`;
}

function stripExistingRuntimeConfig(html: string): string {
  const pattern = new RegExp(
    `${runtimeConfigStartMarker}[\\s\\S]*?${runtimeConfigEndMarker}\\s*`,
    "g",
  );
  return html.replace(pattern, "");
}

function createRuntimeConfigHtml({
  appBasePath,
  apiUrl,
  storagePrefix,
  storageType,
  shareToken,
}: ClientRuntimeConfig): string {
  const normalizedStoragePrefix = storagePrefix?.trim() || "NOCOBASE_";
  const normalizedStorageType = storageType?.trim() || "localStorage";
  const normalizedShareToken = shareToken ?? false;

  return `${runtimeConfigStartMarker}
<script>
  window.NOCOBASE_PORTAL_BASE = ${JSON.stringify(toBrowserBasePath(appBasePath))};
  window.NOCOBASE_API_URL = ${JSON.stringify(apiUrl)};
  window.__nocobase_api_client_storage_prefix__ = ${JSON.stringify(normalizedStoragePrefix)};
  window.__nocobase_api_client_storage_type__ = ${JSON.stringify(normalizedStorageType)};
  window.__nocobase_api_client_share_token__ = ${JSON.stringify(normalizedShareToken)};
</script>
${runtimeConfigEndMarker}
`;
}

function toBrowserBasePath(value: string): string {
  return value ? `${value.replace(/\/+$/, "")}/` : "/";
}

async function serveFileIfExists(
  rootDir: string,
  requestPath: string,
  method: string,
  options: { cacheControl?: string } = {},
): Promise<Response | null> {
  const filePath = resolveClientFile(rootDir, requestPath);
  if (!filePath) {
    return null;
  }

  let stats: Awaited<ReturnType<typeof stat>>;
  try {
    stats = await stat(filePath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") {
      return null;
    }

    throw error;
  }

  if (!stats.isFile()) {
    return null;
  }

  const headers = new Headers({
    "cache-control": options.cacheControl ?? "no-cache",
    "content-length": String(stats.size),
    "content-type": contentTypeFor(filePath),
    "last-modified": stats.mtime.toUTCString(),
  });

  const body =
    method === "HEAD"
      ? null
      : (Readable.toWeb(createReadStream(filePath)) as ConstructorParameters<
          typeof Response
        >[0]);
  return new Response(body, { headers });
}

function getPathInsideClient(pathname: string, basePath: string): string {
  const pathInside =
    basePath && pathname.startsWith(basePath)
      ? pathname.slice(basePath.length)
      : pathname;
  return pathInside.startsWith("/") ? pathInside : `/${pathInside}`;
}

function resolveClientFile(
  rootDir: string,
  requestPath: string,
): string | null {
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(requestPath);
  } catch {
    return null;
  }

  if (decodedPath.includes("\0")) {
    return null;
  }

  const normalizedPath = decodedPath.replace(/^\/+/, "");
  const filePath = path.resolve(rootDir, normalizedPath);
  const relative = path.relative(rootDir, filePath);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return null;
  }

  return filePath;
}

function contentTypeFor(filePath: string): string {
  return (
    contentTypes[path.extname(filePath).toLowerCase()] ??
    "application/octet-stream"
  );
}

function methodNotAllowed(allow: string): Response {
  return Response.json(
    {
      error: "Method not allowed",
    },
    {
      status: 405,
      headers: {
        allow,
      },
    },
  );
}

function notFound(): Response {
  return Response.json(
    {
      error: "Not found",
    },
    {
      status: 404,
    },
  );
}

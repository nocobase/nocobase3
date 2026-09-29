// A Hub in the shape of its HTTP API, for the tests: each route answers from a handler, and every request is recorded.
import { vi } from 'vitest';

export interface RecordedRequest {
  readonly method: string;
  /** The path under `/api/hub/apps/<App ID>/`, empty for the App itself. */
  readonly route: string;
  readonly url: string;
  readonly headers: Record<string, string>;
  /** The body as text: JSON for the JSON requests, the archive's bytes for an upload. */
  readonly body: string;
}

export type Handler = (
  request: RecordedRequest,
) => Response | Promise<Response>;

export const HUB = 'https://hub.example/main';
export const APP_ID = 'crm';
export const REMOTE_URL = `${HUB}/apps/${APP_ID}`;

export const HOST_TARGET = {
  platform: 'linux',
  arch: 'x64',
  libc: 'glibc',
  nodeAbi: 137,
  nodeMajor: 24,
} as const;

export function data(value: object, status = 200): Response {
  return new Response(JSON.stringify({ data: value }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export function failure(code: string, status: number): Response {
  return new Response(
    JSON.stringify({ error: { code, message: 'secret-bearing text' } }),
    { status, headers: { 'content-type': 'application/json' } },
  );
}

/** The routes a Hub answers by default: an App on linux-x64 Node 24, a fresh Release, a deployment that succeeds. */
export function defaultRoutes(): Record<string, Handler> {
  return {
    'GET ': () => data({ id: APP_ID, buildTarget: HOST_TARGET }),
    'POST releases': () =>
      data({ releaseId: 'r1', version: '1.0.0', reused: false }),
    'POST deploy': () =>
      data({ operationId: 'op-1', status: 'queued', reused: false }),
    'GET deployments/op-1/status': () => data({ status: 'succeeded' }),
  };
}

export function fakeHub(overrides: Record<string, Handler | undefined> = {}): {
  requests: RecordedRequest[];
  fetch: ReturnType<typeof vi.fn>;
} {
  const routes = { ...defaultRoutes(), ...overrides };
  const requests: RecordedRequest[] = [];
  const base = `${HUB}/api/hub/apps/${APP_ID}`;
  const fetch = vi.fn(async (input: URL | string, init: RequestInit = {}) => {
    const url = String(input);
    // The App itself is the base without a trailing slash, which the Hub's strict routing would not match.
    if (url !== base && !url.startsWith(`${base}/`))
      throw new Error(`Unexpected URL ${url}`);
    const route = url === base ? '' : url.slice(base.length + 1);
    let body = '';
    if (typeof init.body === 'string') body = init.body;
    else if (init.body) {
      const chunks: Buffer[] = [];
      for await (const chunk of init.body as unknown as AsyncIterable<Uint8Array>)
        chunks.push(Buffer.from(chunk));
      body = Buffer.concat(chunks).toString();
    }
    const request: RecordedRequest = {
      method: init.method ?? 'GET',
      route,
      url,
      headers: { ...(init.headers as Record<string, string>) },
      body,
    };
    requests.push(request);
    const handler = routes[`${request.method} ${route}`];
    if (handler === undefined) return failure('NOT_FOUND', 404);
    return await handler(request);
  });
  vi.stubGlobal('fetch', fetch);
  return { requests, fetch };
}

export const RELEASES = [
  {
    id: 'r2',
    version: '2.0.0',
    checksum: 'b'.repeat(64),
    size: 20,
    createdAt: '2026-09-29T10:00:00.000Z',
    hasConfigTemplate: false,
    buildTarget: HOST_TARGET,
    running: true,
    everDeployed: true,
  },
  {
    id: 'r1',
    version: '1.0.0',
    checksum: 'a'.repeat(64),
    size: 10,
    createdAt: '2026-09-28T10:00:00.000Z',
    hasConfigTemplate: false,
    buildTarget: null,
    running: false,
    everDeployed: true,
  },
];

export const DEPLOYMENT = {
  id: 'op-2',
  releaseId: 'r2',
  kind: 'deploy',
  status: 'succeeded',
  phase: 'completed',
  cacheHit: false,
  error: null,
  createdAt: '2026-09-29T10:01:00.000Z',
  finishedAt: '2026-09-29T10:02:00.000Z',
  config: { mode: 'reuse' },
  release: { version: '2.0.0', checksum: 'b'.repeat(64) },
};

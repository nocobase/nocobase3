import { timingSafeEqual } from 'node:crypto';
import type { DatabaseManager, Row } from '@nocobase/database';
import { ReleaseManagementError } from './errors.js';
import type { ReleaseActor } from './types.js';

export type ReleaseAuthorizer = (request: Request) => Promise<ReleaseActor>;

export interface NocoBaseReleaseAuthorizerOptions {
  apiUrl: string | URL;
  allowedRoles?: string[];
  fetch?: typeof fetch;
}

export interface NativeReleaseAuthorizerOptions {
  auth: ReleaseNativeSessionReader;
  database: Pick<DatabaseManager, 'query'>;
  adminEmails?: string[];
}

export interface ReleaseNativeSessionReader {
  getSession(headers: Headers): Promise<ReleaseNativeSession>;
}

export type ReleaseNativeSession = {
  user: {
    id: string;
    email: string;
    name: string;
  };
} | null;

type HubUserRow = Row & {
  id: string;
  email: string;
  name: string;
  username?: string | null;
  createdAt: string | Date;
};

export function createNativeReleaseAuthorizer(
  options: NativeReleaseAuthorizerOptions,
): ReleaseAuthorizer {
  const adminEmails = new Set(
    options.adminEmails
      ?.map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );

  return async (request) => {
    assertNativeWriteOrigin(request);
    const current = await options.auth.getSession(request.headers);
    if (!current) {
      throw new ReleaseManagementError('需要登录后才能管理发布', {
        status: 401,
        code: 'RELEASE_AUTH_REQUIRED',
      });
    }

    const email = current.user.email.trim().toLowerCase();
    const isAdmin = adminEmails.size
      ? adminEmails.has(email)
      : await isBootstrapAdministrator(options.database, current.user.id);
    if (!isAdmin) {
      throw new ReleaseManagementError('需要 Hub 管理员权限才能管理发布', {
        status: 403,
        code: 'RELEASE_FORBIDDEN',
      });
    }

    return {
      id: current.user.id,
      name: current.user.name.trim() || current.user.email,
      role: 'admin',
    };
  };
}

async function isBootstrapAdministrator(
  database: Pick<DatabaseManager, 'query'>,
  userId: string,
): Promise<boolean> {
  let firstUser: HubUserRow | undefined;
  try {
    firstUser = await database
      .query()
      .selectFrom<HubUserRow>('user')
      .select(['id', 'name', 'username', 'email', 'createdAt'])
      .orderBy('createdAt', 'asc')
      .orderBy('id', 'asc')
      .limit(1)
      .executeTakeFirst<HubUserRow>();
  } catch (error) {
    throw new ReleaseManagementError('Hub 管理员身份暂时无法校验', {
      status: 503,
      code: 'RELEASE_AUTH_UNAVAILABLE',
      cause: error,
    });
  }
  return firstUser?.id === userId;
}

function assertNativeWriteOrigin(request: Request): void {
  if (
    ['GET', 'HEAD', 'OPTIONS'].includes(request.method.toUpperCase()) ||
    request.headers.has('authorization')
  ) {
    return;
  }

  const fetchSite = request.headers.get('sec-fetch-site')?.toLowerCase();
  const requestedWith = request.headers.get('x-requested-with')?.toLowerCase();
  const origin = request.headers.get('origin');
  if (fetchSite === 'cross-site') {
    throw nativeCsrfError();
  }
  if (requestedWith === 'nocobase3') {
    return;
  }
  if (origin && origin === resolveRequestOrigin(request)) {
    return;
  }
  throw nativeCsrfError();
}

function resolveRequestOrigin(request: Request): string {
  const requestUrl = new URL(request.url);
  const protocol =
    request.headers.get('x-forwarded-proto') ??
    requestUrl.protocol.slice(0, -1);
  const host =
    request.headers.get('x-forwarded-host') ??
    request.headers.get('host') ??
    requestUrl.host;
  return `${protocol}://${host}`;
}

function nativeCsrfError(): ReleaseManagementError {
  return new ReleaseManagementError('发布写操作需要来自当前 Hub 页面', {
    status: 403,
    code: 'RELEASE_CSRF_INVALID',
  });
}

export function createNocoBaseReleaseAuthorizer(
  options: NocoBaseReleaseAuthorizerOptions,
): ReleaseAuthorizer {
  const apiUrl = new URL(options.apiUrl);
  const request = options.fetch ?? fetch;
  const allowedRoles = new Set(
    options.allowedRoles?.length ? options.allowedRoles : ['root', 'admin'],
  );

  return async (incomingRequest) => {
    assertCsrfProtection(incomingRequest);
    const headers = copyAuthenticationHeaders(incomingRequest.headers);
    let response: Response;
    try {
      response = await request(appendApiAction(apiUrl, 'auth:check'), {
        method: 'GET',
        headers,
        redirect: 'manual',
      });
    } catch (error) {
      throw new ReleaseManagementError(
        'NocoBase authorization service is unavailable',
        {
          status: 503,
          code: 'RELEASE_AUTH_UNAVAILABLE',
          cause: error,
        },
      );
    }
    const payload = await readJson(response);
    if (!response.ok) {
      throw new ReleaseManagementError(
        'Authentication is required to manage releases',
        {
          status: response.status === 401 ? 401 : 502,
          code:
            response.status === 401
              ? 'RELEASE_AUTH_REQUIRED'
              : 'RELEASE_AUTH_UNAVAILABLE',
        },
      );
    }

    const user = asRecord(asRecord(payload)?.data);
    const roles = Array.isArray(user?.roles)
      ? user.roles
          .map((value) => asRecord(value)?.name)
          .filter((value): value is string => typeof value === 'string')
      : [];
    const authorizedRole = roles.find((role) => allowedRoles.has(role));
    if (!user || !authorizedRole) {
      throw new ReleaseManagementError(
        'A platform administrator role is required to manage releases',
        {
          status: 403,
          code: 'RELEASE_FORBIDDEN',
        },
      );
    }

    const id = user.id;
    if (typeof id !== 'string' && typeof id !== 'number') {
      throw new ReleaseManagementError(
        'NocoBase returned an invalid user identity',
        {
          status: 502,
          code: 'RELEASE_AUTH_INVALID_IDENTITY',
        },
      );
    }

    const name = [user.nickname, user.username, user.email].find(
      (value): value is string =>
        typeof value === 'string' && Boolean(value.trim()),
    );
    return {
      id: String(id),
      name: name?.trim() ?? `User ${id}`,
      role: authorizedRole,
    };
  };
}

function assertCsrfProtection(request: Request): void {
  if (
    ['GET', 'HEAD', 'OPTIONS'].includes(request.method.toUpperCase()) ||
    request.headers.has('authorization')
  ) {
    return;
  }

  const headerToken = request.headers.get('x-csrf-token') ?? '';
  const cookieToken =
    readCookie(request.headers.get('cookie'), 'csrfToken') ?? '';
  const header = Buffer.from(headerToken);
  const cookie = Buffer.from(cookieToken);
  if (
    !header.length ||
    header.length !== cookie.length ||
    !timingSafeEqual(header, cookie)
  ) {
    throw new ReleaseManagementError(
      'A valid CSRF token is required for Cookie-authenticated release changes',
      {
        status: 403,
        code: 'RELEASE_CSRF_INVALID',
      },
    );
  }
}

function readCookie(header: string | null, name: string): string | undefined {
  for (const item of header?.split(';') ?? []) {
    const separator = item.indexOf('=');
    if (separator < 0 || item.slice(0, separator).trim() !== name) {
      continue;
    }
    try {
      return decodeURIComponent(item.slice(separator + 1).trim());
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export function unavailableReleaseAuthorizer(): ReleaseAuthorizer {
  return async () => {
    throw new ReleaseManagementError(
      'NocoBase API is not configured for release authorization',
      {
        status: 503,
        code: 'RELEASE_AUTH_NOT_CONFIGURED',
      },
    );
  };
}

function copyAuthenticationHeaders(source: Headers): Headers {
  const headers = new Headers({ accept: 'application/json' });
  for (const name of [
    'authorization',
    'cookie',
    'x-authenticator',
    'x-role',
    'x-portal',
    'x-locale',
  ]) {
    const value = source.get(name);
    if (value) {
      headers.set(name, value);
    }
  }
  return headers;
}

function ensureTrailingSlash(url: URL): URL {
  const next = new URL(url);
  if (!next.pathname.endsWith('/')) {
    next.pathname = `${next.pathname}/`;
  }
  return next;
}

function appendApiAction(url: URL, action: string): URL {
  const next = ensureTrailingSlash(url);
  next.pathname = `${next.pathname}${action}`;
  return next;
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new ReleaseManagementError(
      'NocoBase returned an invalid authorization response',
      {
        status: 502,
        code: 'RELEASE_AUTH_INVALID_RESPONSE',
        cause: error,
      },
    );
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

import { timingSafeEqual } from 'node:crypto';

import type { AuthSession } from '@nocobase/app-plugin-authentication';
import type { DatabaseManager, Row } from '@nocobase/app-database';

import { SettingsError } from './errors.js';
import type { SettingsActor } from './types.js';

export type SettingsAuthorizer = (request: Request) => Promise<SettingsActor>;

export interface NocoBaseSettingsAuthorizerOptions {
  apiUrl: string | URL;
  allowedRoles?: string[];
  fetch?: typeof fetch;
}

export interface NativeSessionReader {
  getSession(headers: Headers): Promise<AuthSession>;
}

export interface NativeSettingsAuthorizerOptions {
  auth: NativeSessionReader;
  database: Pick<DatabaseManager, 'query'>;
  adminEmails?: string[];
}

type HubUserRow = Row & {
  id: string;
  email: string;
  name: string;
  username?: string | null;
  createdAt: string | Date;
};

export function createNativeSettingsAuthorizer(
  options: NativeSettingsAuthorizerOptions,
): SettingsAuthorizer {
  const adminEmails = new Set(
    options.adminEmails
      ?.map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );

  return async (request) => {
    assertNativeWriteOrigin(request);
    const current = await options.auth.getSession(request.headers);
    if (!current) {
      throw new SettingsError('需要登录后才能管理配置', {
        status: 401,
        code: 'SETTINGS_AUTH_REQUIRED',
      });
    }

    const email = current.user.email.trim().toLowerCase();
    const isAdmin = adminEmails.size
      ? adminEmails.has(email)
      : await isBootstrapAdministrator(options.database, current.user.id);
    if (!isAdmin) {
      throw new SettingsError('需要 Hub 管理员权限才能管理配置', {
        status: 403,
        code: 'SETTINGS_FORBIDDEN',
      });
    }

    return {
      id: current.user.id,
      name: current.user.name.trim() || current.user.email,
      role: 'admin',
    };
  };
}

export function createNocoBaseSettingsAuthorizer(
  options: NocoBaseSettingsAuthorizerOptions,
): SettingsAuthorizer {
  const apiUrl = new URL(options.apiUrl);
  const request = options.fetch ?? fetch;
  const allowedRoles = new Set(
    options.allowedRoles?.length ? options.allowedRoles : ['root', 'admin'],
  );

  return async (incomingRequest) => {
    assertCsrfProtection(incomingRequest);
    let response: Response;
    try {
      response = await request(appendApiAction(apiUrl, 'auth:check'), {
        method: 'GET',
        headers: copyAuthenticationHeaders(incomingRequest.headers),
        redirect: 'manual',
      });
    } catch (error) {
      throw new SettingsError('NocoBase 权限服务暂不可用', {
        status: 503,
        code: 'SETTINGS_AUTH_UNAVAILABLE',
        cause: error,
      });
    }

    const payload = await readJson(response);
    if (!response.ok) {
      throw new SettingsError('需要登录后才能管理配置', {
        status: response.status === 401 ? 401 : 502,
        code:
          response.status === 401
            ? 'SETTINGS_AUTH_REQUIRED'
            : 'SETTINGS_AUTH_UNAVAILABLE',
      });
    }

    const user = asRecord(asRecord(payload)?.data);
    const roles = Array.isArray(user?.roles)
      ? user.roles
          .map((value) => asRecord(value)?.name)
          .filter((value): value is string => typeof value === 'string')
      : [];
    const authorizedRole = roles.find((role) => allowedRoles.has(role));
    if (!user || !authorizedRole) {
      throw new SettingsError('需要平台管理员角色才能管理配置', {
        status: 403,
        code: 'SETTINGS_FORBIDDEN',
      });
    }

    const id = user.id;
    if (typeof id !== 'string' && typeof id !== 'number') {
      throw new SettingsError('NocoBase 返回了无效的用户身份', {
        status: 502,
        code: 'SETTINGS_AUTH_INVALID_IDENTITY',
      });
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

export function unavailableSettingsAuthorizer(): SettingsAuthorizer {
  return async () => {
    throw new SettingsError('未配置 NocoBase API，无法校验配置管理权限', {
      status: 503,
      code: 'SETTINGS_AUTH_NOT_CONFIGURED',
    });
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
    throw new SettingsError('Hub 管理员身份暂时无法校验', {
      status: 503,
      code: 'SETTINGS_AUTH_UNAVAILABLE',
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

function nativeCsrfError(): SettingsError {
  return new SettingsError('配置写操作需要来自当前 Hub 页面', {
    status: 403,
    code: 'SETTINGS_CSRF_INVALID',
  });
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
    throw new SettingsError('Cookie 登录的配置写操作需要有效的 CSRF Token', {
      status: 403,
      code: 'SETTINGS_CSRF_INVALID',
    });
  }
}

function readCookie(header: string | null, name: string): string | undefined {
  for (const item of header?.split(';') ?? []) {
    const separator = item.indexOf('=');
    if (separator < 0 || item.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(item.slice(separator + 1).trim());
    } catch {
      return undefined;
    }
  }
  return undefined;
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
    if (value) headers.set(name, value);
  }
  return headers;
}

function appendApiAction(url: URL, action: string): URL {
  const next = new URL(url);
  if (!next.pathname.endsWith('/')) next.pathname = `${next.pathname}/`;
  next.pathname = `${next.pathname}${action}`;
  return next;
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new SettingsError('NocoBase 权限服务返回了无效响应', {
      status: 502,
      code: 'SETTINGS_AUTH_INVALID_RESPONSE',
      cause: error,
    });
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

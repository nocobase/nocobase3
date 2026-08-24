import type { DatabaseConnection } from '@nocobase/database';
import {
  Authorization,
  createAuthorization,
  type AuthorizationPlugin,
} from '@nocobase/authorization/core';
import { pages } from '@nocobase/authorization/pages';
import {
  permissionSets,
  type PermissionSetsAuthorizationApi,
} from '@nocobase/authorization/permissions';

interface AuthSessionUser {
  id: string;
}

interface AuthSession {
  user: AuthSessionUser;
}

export type AppAuthorization = Authorization & PermissionSetsAuthorizationApi;

export interface CreateAppAuthorizationOptions {
  connection?: DatabaseConnection;
}

export function createAppAuthorization(
  options: CreateAppAuthorizationOptions,
): AppAuthorization {
  return createAuthorization({
    connection: options.connection,
    plugins: [authenticationIdentity(), permissionSets(), pages()],
  });
}

function authenticationIdentity(): AuthorizationPlugin {
  return {
    id: 'app-authentication-identity',
    setup(authz): void {
      authz.use(async (request, next) => {
        const session = readAuthSession(request.http.var.auth);
        request.principal = { type: 'user', id: session.user.id };
        request.subjects.add({ type: 'authenticated', id: '*' });
        await next();
      });
    },
  };
}

function readAuthSession(value: unknown): AuthSession {
  if (!isRecord(value) || !isRecord(value.user)) {
    throw new Error('Authorization requires an authenticated session');
  }
  const id = value.user.id;
  if (typeof id !== 'string' || id.length === 0) {
    throw new Error('Authorization session user must have an id');
  }
  return { user: { id } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

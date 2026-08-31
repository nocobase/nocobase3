import type { DatabaseConnection } from '@nocobase/db';
import {
  Authorization,
  createAuthorization,
  type AuthorizationPlugin,
} from '@nocobase/authorization/core';
import {
  databaseAuthorization,
  type DatabaseAuthorizationApi,
} from '@nocobase/authorization/database';
import {
  defaultAccess,
  type DefaultAccessAuthorizationApi,
} from '@nocobase/authorization/default-access';
import { pages } from '@nocobase/authorization/pages';
import {
  permissionSets,
  type PermissionSetsAuthorizationApi,
} from '@nocobase/authorization/permissions';
import {
  restrictionRules,
  type RestrictionRulesAuthorizationApi,
} from '@nocobase/authorization/restriction-rules';
import {
  sharingRules,
  type SharingRulesAuthorizationApi,
} from '@nocobase/authorization/sharing-rules';

interface AuthSessionUser {
  id: string;
}

interface AuthSession {
  user: AuthSessionUser;
}

export interface AuthorizationUserOption {
  id: string;
  name: string;
  username?: string;
  email: string;
}

export interface AuthorizationRecordOption {
  id: string;
  label: string;
  description?: string;
}

export interface AppAuthorizationAdministrationApi {
  listUsers(): Promise<readonly AuthorizationUserOption[]>;
  listRecords(
    collection: string,
  ): Promise<readonly AuthorizationRecordOption[]>;
}

export interface AppAuthorizationAdministrationPluginApi {
  administration: AppAuthorizationAdministrationApi;
}

export type AppAuthorization = Authorization &
  PermissionSetsAuthorizationApi &
  DatabaseAuthorizationApi &
  DefaultAccessAuthorizationApi &
  SharingRulesAuthorizationApi &
  RestrictionRulesAuthorizationApi &
  AppAuthorizationAdministrationPluginApi;

export interface CreateAppAuthorizationOptions {
  connection?: DatabaseConnection;
}

export function createAppAuthorization(
  options: CreateAppAuthorizationOptions,
): AppAuthorization {
  let resolveCollection: (
    name: string,
  ) => { name: string; fields: readonly string[] } | undefined = () =>
    undefined;
  const authz = createAuthorization({
    connection: options.connection,
    plugins: [
      authenticationIdentity(),
      permissionSets(),
      databaseAuthorization(),
      defaultAccess(),
      sharingRules(),
      restrictionRules(),
      pages(),
      applicationAdministration(options.connection, (name) =>
        resolveCollection(name),
      ),
    ],
  });
  resolveCollection = (name) => authz.database.collections.get(name);
  return authz;
}

function applicationAdministration(
  connection?: DatabaseConnection,
  collectionResolver: (
    name: string,
  ) => { name: string; fields: readonly string[] } | undefined = () =>
    undefined,
): AuthorizationPlugin<AppAuthorizationAdministrationPluginApi> {
  return {
    id: 'app-authorization-administration',
    authorizationApi: {
      administration: {
        async listUsers(): Promise<readonly AuthorizationUserOption[]> {
          if (!connection) return [];
          const rows = await connection.query
            .selectFrom('user')
            .select(['id', 'name', 'username', 'email'])
            .orderBy('name', 'asc')
            .execute();
          return rows.map((row) => ({
            id: String(row.id),
            name: String(row.name),
            ...(typeof row.username === 'string'
              ? { username: row.username }
              : {}),
            email: String(row.email),
          }));
        },
        async listRecords(
          collectionName: string,
        ): Promise<readonly AuthorizationRecordOption[]> {
          if (!connection) return [];
          const collection = collectionResolver(collectionName);
          if (!collection) return [];
          const idField = collection.fields.includes('id')
            ? 'id'
            : collection.fields[0];
          if (!idField) return [];
          const labelField =
            ['title', 'name', 'orderNumber', 'username', 'email'].find(
              (field) => collection.fields.includes(field),
            ) ?? idField;
          const fields =
            idField === labelField ? [idField] : [idField, labelField];
          const table = collection.name.replace(/^main\./, '');
          const rows = await connection.query
            .selectFrom(table)
            .select(fields)
            .limit(100)
            .execute();
          return rows.map((row) => ({
            id: String(Reflect.get(row, idField)),
            label: String(Reflect.get(row, labelField)),
            ...(labelField === idField
              ? {}
              : { description: String(Reflect.get(row, idField)) }),
          }));
        },
      },
    },
  };
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

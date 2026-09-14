import type { AuthorizationConditions } from '@nocobase/authorization/core';
import type { FilterAst } from '@nocobase/db';

export interface DatabaseCollectionDefinition {
  name: string;
  title?: string;
  description?: string;
  actions: readonly string[];
  fields: readonly string[];
  attributes?: Readonly<Record<string, string>>;
}

export type DatabaseRecordAccess =
  | string
  | {
      key: string;
      params?: unknown;
    };

export interface DatabaseAccessScope {
  type: 'database';
  recordAccess: DatabaseRecordAccess;
}

export interface DatabaseRecordAccessConfig {
  key: string;
  params?: unknown;
}

export interface DatabasePermissionFields {
  input?: '*' | readonly string[];
  output?: '*' | readonly string[];
}

export interface DatabaseActionGrant {
  fields?: DatabasePermissionFields;
  recordAccess?: readonly DatabaseRecordAccess[];
}

export type DatabaseAuthorizationPolicy = DatabaseActionGrant & {
  type: 'database';
};

export type DatabaseGrantDefinition = Readonly<
  Record<string, DatabaseActionGrant>
>;

export interface DatabaseAuthorizationParams {
  fields?: DatabaseAuthorizationFieldRequest;
}

export interface DatabaseAuthorizationFieldRequest {
  input?: readonly string[];
  output?: readonly string[];
  filter?: readonly string[];
  sort?: readonly string[];
  group?: readonly string[];
}

/**
 * One action's node of a Repository Policy.
 *
 * `fields` is a list even when the grant says `'*'`, because a Policy node
 * treats an absent or `false` allowlist as no fields at all rather than as a
 * free pass. A grant with no record restriction carries `scope: true`; no rows
 * at all is a denial, not a scope, so it never reaches this shape.
 */
export interface DatabaseAuthorizationConditions extends AuthorizationConditions {
  type: 'database';
  collection: string;
  action: string;
  scope: true | FilterAst;
  fields: readonly string[];
}

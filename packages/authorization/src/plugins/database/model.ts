import type { AuthorizationConditions } from '../../core/index.js';
import type { DatabaseFilter } from './filter.js';

export interface DatabaseCollectionDefinition {
  name: string;
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

export interface DatabaseAuthorizationConditions extends AuthorizationConditions {
  type: 'database';
  collection: string;
  action: string;
  filter: DatabaseFilter;
  fields: {
    input: '*' | readonly string[];
    output: '*' | readonly string[];
  };
}

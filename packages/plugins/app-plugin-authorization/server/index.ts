export { default } from './plugin.js';
export {
  appAuthorizationDatabase,
  createAppAuthorization,
  type CreateAppAuthorizationOptions,
} from './authorization.js';
export type {
  AuthorizationCollection,
  DatabaseApi,
  DatabaseAuthorizationApi,
  DatabaseAuthorizationConditions,
  DatabaseAuthorizationParams,
  DatabaseGrantDefinition,
  DatabaseRecordAccess,
  DatabaseScope,
} from './database/index.js';
export {
  condition,
  defineRecordAccessPolicy,
  type RecordAccessPolicy,
} from './database/index.js';
export type {
  Authorization,
  AuthorizationEnv,
  AuthorizationScope,
} from '@nocobase/authorization/core';
export type {
  AppPermissionSetsConfig,
  AuthorizationConfig,
} from './authorization.js';
// Re-exported so an application assembles its plugin list from the package it
// reads `AuthorizationConfig` from.
export { pages } from './pages-authorization.js';
export type { PermissionSetsApi } from '@nocobase/authorization/permissions';
export { databaseAuthorization } from './database/index.js';
export {
  defaultAccess,
  restrictionRules,
  sharingRules,
  type DefaultAccessOptions,
  type RestrictionRulesOptions,
  type SharingRulesOptions,
} from './rules.js';
export type { AuthorizationPlugin } from '@nocobase/authorization/core';
export {
  authorizationToken,
  permissionSetsToken,
  type AppAuthorizationService,
} from './tokens.js';
export type {
  RepositoryAuthorization,
  RepositoryAuthorizationApi,
  RepositoryAuthorizationExposure,
  RepositoryAuthorizationPrincipal,
} from './repositories.js';
export { AuthorizationProvider } from './providers/authorization.js';

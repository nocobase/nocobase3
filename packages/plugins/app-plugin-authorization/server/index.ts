export { default } from './plugin.js';
export {
  appAuthorizationDatabase,
  createAppAuthorization,
  type CreateAppAuthorizationOptions,
} from './authorization.js';
export type {
  DatabaseAuthorizationConditions,
  DatabaseAuthorizationParams,
  DatabaseFieldFilter,
  DatabaseFilter,
  DatabaseFilterOperator,
} from '@nocobase/authorization/database';
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
export { databaseAuthorization } from '@nocobase/authorization/database';
export { defaultAccess } from '@nocobase/authorization/default-access';
export { sharingRules } from '@nocobase/authorization/sharing-rules';
export { restrictionRules } from '@nocobase/authorization/restriction-rules';
export type { AuthorizationPlugin } from '@nocobase/authorization/core';
export { authorizationToken, permissionSetsToken } from './tokens.js';
export { AuthorizationProvider } from './providers/authorization.js';

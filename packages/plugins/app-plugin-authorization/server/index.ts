export { default } from './plugin.js';
export {
  createAppAuthorization,
  type AppAuthorization,
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
  AuthorizationEnv,
  AuthorizationScope,
} from '@nocobase/authorization/core';
export { authorizationToken } from './tokens.js';
export { AuthorizationProvider } from './providers/authorization.js';
export {
  PermissionResourceRegistry,
  type PermissionResourceContribution,
  type PermissionResourceOption,
  type PermissionResourceTypeOption,
  type PermissionSelectOption,
} from './permission-resources.js';

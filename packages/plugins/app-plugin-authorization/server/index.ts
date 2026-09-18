export { default } from './plugin.js';
export {
  createAppAuthorization,
  type CreateAppAuthorizationOptions,
} from './authorization.js';
export type {
  AuthorizationCollection,
  DatabaseApi,
  DatabaseAuthorizationApi,
  DatabaseCollectionRegistration,
  DatabaseAuthorizationConditions,
  DatabaseAuthorizationParams,
  DatabaseGrantDefinition,
  DatabaseRecordAccess,
  DatabaseScope,
} from './database/index.js';
export {
  condition,
  anyScope,
  scopeAst,
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
export type { AuthorizationPlugin } from '@nocobase/authorization/core';
export {
  authorizationToken,
  permissionSetsToken,
  type AppAuthorizationService,
} from './tokens.js';
export type {
  RepositoryAuthorization,
  RepositoryAuthorizationExposure,
  RepositoryAuthorizationPrincipal,
} from './repositories.js';
export { AuthorizationProvider } from './providers/authorization.js';
export { translateAuthorization, type OptionText } from './i18n.js';
export { AUTHORIZATION_NAMESPACE } from '../shared.js';

export type {
  SubjectAdministration,
  SubjectOption,
  SubjectSelectionContext,
} from './subjects.js';

export { DatabaseResourceAuthorizer } from './database/authorizer.js';
export {
  DatabaseCollectionRegistry,
  collectionResolver,
} from './database/index.js';

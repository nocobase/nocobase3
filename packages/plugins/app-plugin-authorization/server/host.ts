import type {
  AuthorizationSubjectRegistry,
  CompositeApi,
  RecordAccessRegistry,
  ResourceTypeRegistry,
} from '@nocobase/authorization/core';
import type { DatabaseApi } from './database/api.js';
import type { AuthorizationUiApi } from './ui.js';

/**
 * What the extension helpers read: the application's Authorization, or a
 * plugin's setup context that requires the `composites`, `database` and `ui`
 * APIs.
 */
export interface AuthorizationExtensionHost {
  readonly ui: AuthorizationUiApi;
  readonly resourceTypes: ResourceTypeRegistry;
  readonly recordAccess: RecordAccessRegistry;
  readonly subjects: AuthorizationSubjectRegistry;
  readonly composites: CompositeApi;
  readonly database: DatabaseApi;
}

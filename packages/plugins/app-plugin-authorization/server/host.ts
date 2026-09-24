import type {
  AuthorizationSubjectRegistry,
  BusinessApi,
  RecordAccessRegistry,
  ResourceGroupRegistry,
  ResourceTypeRegistry,
  SectionRegistry,
} from '@nocobase/authorization/core';
import type { DatabaseApi } from './database/api.js';

/**
 * What the extension helpers read: the application's Authorization, or a
 * plugin's setup context that requires the `business` and `database` APIs.
 */
export interface AuthorizationExtensionHost {
  readonly sections: SectionRegistry;
  readonly resourceGroups: ResourceGroupRegistry;
  readonly resourceTypes: ResourceTypeRegistry;
  readonly recordAccess: RecordAccessRegistry;
  readonly subjects: AuthorizationSubjectRegistry;
  readonly business: BusinessApi;
  readonly database: DatabaseApi;
}

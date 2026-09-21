import {
  defineAppConfig,
  type AppConfigFactory,
} from '@nocobase/app-server/config';
import { AUTHENTICATION_USER_LIFECYCLE_KEY } from '@nocobase/app-plugin-authentication';
import { HUB_USER_LIFECYCLE_KEY } from '@nocobase/app-plugin-hub/server';
import type { UsersConfig } from '@nocobase/app-plugin-user-management/server';

const users: AppConfigFactory<UsersConfig> = defineAppConfig(() => ({
  // Hub assigns its own roles instead of the default Permission Set scope.
  permissionSets: false,
  // Deleting a user is enabled only with every participant that cleans up
  // after it: authentication removes sessions and accounts, Hub checks the
  // operator and App ownership and removes API Keys.
  deletion: {
    enabled: true,
    requiredHandlers: [
      AUTHENTICATION_USER_LIFECYCLE_KEY,
      HUB_USER_LIFECYCLE_KEY,
    ],
  },
}));
export default users;

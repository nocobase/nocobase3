import {
  defineAppConfig,
  type AppConfigFactory,
} from '@nocobase/app-server/config';
import type { UsersConfig } from '@nocobase/app-plugin-user-management/server';

const users: AppConfigFactory<UsersConfig> = defineAppConfig(() => ({
  permissionSets: false,
}));
export default users;

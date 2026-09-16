import {
  defineAppConfig,
  type AppConfigFactory,
} from '@nocobase/app-server/config';
import {
  defaultAccess,
  restrictionRules,
  sharingRules,
  type AuthorizationConfig,
} from '@nocobase/app-plugin-authorization/server';

// Permission sets, page and database authorization are built in.
const authorization: AppConfigFactory<AuthorizationConfig> = defineAppConfig(
  (_runtime) => ({
    permissionSets: { rootSet: 'root', defaultSet: 'member' },
    plugins: [defaultAccess(), sharingRules(), restrictionRules()],
  }),
);

export default authorization;

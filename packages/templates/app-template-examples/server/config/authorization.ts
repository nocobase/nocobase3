import {
  defineAppConfig,
  type AppConfigFactory,
} from '@nocobase/app-server/config';
import {
  defaultAccess,
  pages,
  restrictionRules,
  sharingRules,
  type AuthorizationConfig,
} from '@nocobase/app-plugin-authorization/server';

// The plugin installs Permission Sets and database authorization, and
// registers the identity step; the list below is the rest, and this
// application's to change.
const authorization: AppConfigFactory<AuthorizationConfig> = defineAppConfig(
  (_runtime) => ({
    permissionSets: { rootSet: 'root', defaultSet: 'member' },
    plugins: [pages(), defaultAccess(), sharingRules(), restrictionRules()],
  }),
);

export default authorization;

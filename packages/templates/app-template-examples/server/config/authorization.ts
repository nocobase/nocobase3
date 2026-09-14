import {
  defineAppConfig,
  type AppConfigFactory,
} from '@nocobase/app-server/config';
import {
  databaseAuthorization,
  defaultAccess,
  pages,
  restrictionRules,
  sharingRules,
  type AuthorizationConfig,
} from '@nocobase/app-plugin-authorization/server';

// The plugin installs Permission Sets and registers the identity step; the
// list below is the rest, and this application's to change.
const authorization: AppConfigFactory<AuthorizationConfig> = defineAppConfig(
  (_runtime) => ({
    permissionSets: { rootSet: 'root', defaultSet: 'member' },
    plugins: [
      pages(),
      databaseAuthorization({ source: 'main' }),
      defaultAccess(),
      sharingRules(),
      restrictionRules(),
    ],
  }),
);

export default authorization;

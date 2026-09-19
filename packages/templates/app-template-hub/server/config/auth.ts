import {
  defineAppConfig,
  type AppConfigFactory,
} from '@nocobase/app-server/config';
import { hubApiKeyAuthentication } from '@nocobase/app-plugin-hub/server';
import type { AuthConfig } from '@nocobase/app-plugin-authentication/server';
import { username } from 'better-auth/plugins';

const auth: AppConfigFactory<AuthConfig> = defineAppConfig((_runtime) => ({
  plugins: [username({ displayUsername: false }), ...hubApiKeyAuthentication()],
  emailAndPassword: { enabled: true, autoSignIn: false },
  session: { storeSessionInDatabase: true },
}));

export default auth;

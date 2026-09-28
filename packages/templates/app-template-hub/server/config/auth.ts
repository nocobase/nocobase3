import type { AppConfigFactory } from '@nocobase/app-server/config';
import { hubApiKeyAuthentication } from '@nocobase/app-plugin-hub/server';
import {
  defineAuthConfig,
  type AuthConfig,
} from '@nocobase/app-plugin-authentication/server';
import { username } from 'better-auth/plugins';

const auth: AppConfigFactory<AuthConfig> = defineAuthConfig({
  defaults: {
    plugins: [
      username({ displayUsername: false }),
      ...hubApiKeyAuthentication(),
    ],
    emailAndPassword: { enabled: true, autoSignIn: false },
    session: { storeSessionInDatabase: true },
  },
});

export default auth;

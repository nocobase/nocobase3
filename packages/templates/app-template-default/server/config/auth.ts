import type { AppConfigFactory } from '@nocobase/app-server/config';
import { apiKey } from '@nocobase/app-plugin-api-keys/server';
import {
  defineAuthConfig,
  type AuthConfig,
} from '@nocobase/app-plugin-authentication/server';
import { username } from 'better-auth/plugins';

const auth: AppConfigFactory<AuthConfig> = defineAuthConfig({
  defaults: {
    plugins: [username({ displayUsername: false }), apiKey()],
    emailAndPassword: { enabled: true, autoSignIn: false },
    session: { storeSessionInDatabase: true },
  },
});

export default auth;

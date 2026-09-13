import {
  defineAppConfig,
  type AppConfigFactory,
} from '@nocobase/app-server/config';
import type { AuthConfig } from '@nocobase/app-plugin-authentication/server';
import { username } from 'better-auth/plugins';

const auth: AppConfigFactory<AuthConfig> = defineAppConfig((_runtime) => ({
  plugins: [username({ displayUsername: false })],
  emailAndPassword: { enabled: true, autoSignIn: false },
  session: { storeSessionInDatabase: true },
}));

export default auth;

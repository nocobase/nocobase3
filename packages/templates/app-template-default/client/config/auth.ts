import { defineAppConfig, type AppConfigFactory } from '@nocobase/app-client';
import type { AuthConfig } from '@nocobase/app-plugin-authentication/client';
import { usernameClient } from 'better-auth/client/plugins';

const auth: AppConfigFactory<AuthConfig> = defineAppConfig((_runtime) => ({
  plugins: [usernameClient({ displayUsername: false })],
}));

export default auth;

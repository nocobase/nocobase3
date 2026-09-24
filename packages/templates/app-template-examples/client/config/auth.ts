import { defineAppConfig, type AppConfigFactory } from '@nocobase/app-client';
import { apiKeyClient } from '@nocobase/app-plugin-api-keys/client';
import type { AuthConfig } from '@nocobase/app-plugin-authentication/client';
import { usernameClient } from 'better-auth/client/plugins';

const auth: AppConfigFactory<AuthConfig> = defineAppConfig((_runtime) => ({
  plugins: [usernameClient({ displayUsername: false }), apiKeyClient()],
}));

export default auth;

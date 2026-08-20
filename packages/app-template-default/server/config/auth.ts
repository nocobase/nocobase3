import { defineConfig, type ConfigFactory } from '@nocobase/app-server/config';
import type { AuthOptions } from '@nocobase/authentication';

export type AppAuthConfig = Omit<AuthOptions, 'connection'>;

const authConfig: ConfigFactory<AppAuthConfig> = defineConfig(
  ({ env }): AppAuthConfig => {
    const secret = env.string('AUTH_SECRET');
    if (!secret) {
      throw new Error('AUTH_SECRET is required.');
    }

    return {
      secret,
      emailAndPassword: {
        enabled: true,
      },
    };
  },
);

export default authConfig;

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
      baseURL: env.string('NOCOBASE_AUTH_URL'),
      secret,
      emailAndPassword: {
        enabled: true,
        autoSignIn: false,
      },
      session: {
        storeSessionInDatabase: true,
      },
    };
  },
);

export default authConfig;

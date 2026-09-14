import {
  defineAppConfig,
  type AppConfigFactory,
} from '@nocobase/app-server/config';
import type { AppLoggingConfig } from '@nocobase/app-server/logging';

const logging: AppConfigFactory<AppLoggingConfig> = defineAppConfig(
  (runtime) => ({
    default: 'system',
    name: 'app',
    level: 'info',
    pretty: runtime.env.NODE_ENV !== 'production',
    base: { service: 'app' },
    redact: [
      'password',
      'password_confirmation',
      'token',
      'accessToken',
      'refreshToken',
      'secret',
      'authorization',
      'Authorization',
      'cookie',
      'Cookie',
      'headers.authorization',
      'headers.Authorization',
      'headers.cookie',
      'headers.Cookie',
    ],
  }),
);

export default logging;

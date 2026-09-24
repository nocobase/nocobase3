import {
  defineAppConfig,
  envString,
  type AppConfigFactory,
} from '@nocobase/app-server/config';
import type { AppIdentityConfig } from '@nocobase/app-server/config';
import {
  joinBasePath,
  normalizeBasePath,
  resolveAppNameFromBasePath,
} from '@nocobase/app-server/support';

const app: AppConfigFactory<AppIdentityConfig> = defineAppConfig({
  env: { APP_PUBLIC_ORIGIN: envString('publicOrigin') },
  defaults: (runtime) => {
    const { routing } = runtime;
    const publicBasePath = normalizeBasePath(routing.publicBasePath || '/main');
    return {
      name: routing.name || resolveAppNameFromBasePath(publicBasePath, 'main'),
      publicBasePath,
      internalBasePath: routing.internalBasePath,
      publicApiUrl: joinBasePath(publicBasePath, '/api'),
    };
  },
});

export default app;

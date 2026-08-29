import type { Application } from '@nocobase/app-server-kit/application';
import {
  defineApiRoutes,
  type AppApiRoutes,
} from '@nocobase/app-server-kit/router';

import type { AppConfig } from '../../config/index.js';
import { appExampleServiceToken } from '../../providers/index.js';

const exampleApiRoutes: AppApiRoutes<Application<AppConfig>> = defineApiRoutes({
  name: '@nocobase/app-template-default/api/example',
  register(router, app): void {
    router.get('/example', (context) => {
      const exampleService = app.container.resolve(appExampleServiceToken);

      return context.json({
        scope: 'api',
        message: exampleService.getMessage(),
      });
    });
  },
});

const apiRoutes: readonly AppApiRoutes<Application<AppConfig>>[] = [
  exampleApiRoutes,
];

export default apiRoutes;

import type { AppPluginRoutesApplication } from '@nocobase/app-server-kit/plugins';
import { Hono } from 'hono';

import { heartbeatServiceToken } from '../token.js';

export default function registerServiceProviderExampleRoutes({
  router,
  container,
}: AppPluginRoutesApplication): void {
  const routes = new Hono();

  routes.get('/status', (context) => {
    const heartbeat = container.resolve(heartbeatServiceToken);

    return context.json({
      service: '@nocobase/app-plugin-service-provider-example',
      ...heartbeat.getState(),
    });
  });

  router.route('/service-provider-example', routes);
}

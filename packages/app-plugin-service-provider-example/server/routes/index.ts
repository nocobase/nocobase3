import type { ServiceContainer } from '@nocobase/service-provider';
import { Hono } from 'hono';

import { heartbeatServiceToken } from '../token.js';

export interface ServiceProviderExampleRoutesApplication {
  readonly container: ServiceContainer;
}

export default function registerServiceProviderExampleRoutes(
  { container }: ServiceProviderExampleRoutesApplication,
  router: Hono,
): void {
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

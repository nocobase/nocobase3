import type { AppPluginRoutesContext } from '@nocobase/app-server-kit/plugins';
import { Hono } from 'hono';

export default function registerRoutes({ app }: AppPluginRoutesContext): void {
  const routes = new Hono();

  routes.get('/', (context) =>
    context.json({
      plugin: '@nocobase/app-plugin-routes-example',
      message: 'Hello from the routes example plugin',
    }),
  );

  app.route('/api/routes-example', routes);
}

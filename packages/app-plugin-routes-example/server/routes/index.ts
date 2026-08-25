import type { AppPluginRoutesContext } from '@nocobase/app-server-kit/plugins';
import { Hono } from 'hono';

export default function registerRoutes({
  protectedRoutes,
}: AppPluginRoutesContext): void {
  const routes = new Hono();

  routes.get('/', (context) =>
    context.json({
      plugin: '@nocobase/app-plugin-routes-example',
      message: 'Hello from the routes example plugin',
    }),
  );

  protectedRoutes.route('/routes-example', routes);
}

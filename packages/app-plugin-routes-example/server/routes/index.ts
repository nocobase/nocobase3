import type { AppPluginRoutesContext } from '@nocobase/app-server-kit/plugins';
import { Hono, type MiddlewareHandler } from 'hono';

export interface RoutesExamplePluginDeps {
  readonly auth: {
    required(): MiddlewareHandler;
  };
}

type RoutesExamplePluginContext =
  AppPluginRoutesContext<RoutesExamplePluginDeps>;

export default function registerRoutes({
  app,
  deps,
}: RoutesExamplePluginContext): void {
  const routes = new Hono();

  routes.get('/', deps.auth.required(), (context) =>
    context.json({
      plugin: '@nocobase/app-plugin-routes-example',
      message: 'Hello from the routes example plugin',
    }),
  );

  app.route('/api/routes-example', routes);
}

import { Hono } from 'hono';

export default function registerRoutes(router: Hono): void {
  const routes = new Hono();

  routes.get('/', (context) =>
    context.json({
      plugin: '@nocobase/app-plugin-routes-example',
      message: 'Hello from the routes example plugin',
    }),
  );

  router.route('/routes-example', routes);
}

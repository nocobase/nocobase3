import type { AppPluginRoutesContext } from '@nocobase/app-server/plugins';
import { Hono } from 'hono';

export interface ExamplePluginRoutesDeps {
  logging: {
    getLogger(): {
      info(data: Record<string, unknown>, message: string): void;
    };
  };
}

export interface ExamplePluginRoutesServices {
  appSettingsStore: {
    all(): Promise<unknown[]>;
  };
}

export type ExamplePluginRoutesContext = AppPluginRoutesContext<
  ExamplePluginRoutesDeps,
  ExamplePluginRoutesServices
>;

export default function registerRoutes({
  app,
  deps,
  services,
}: ExamplePluginRoutesContext): void {
  const routes = new Hono();

  routes.get('/', async (context) => {
    const settings = await services.appSettingsStore.all();

    deps.logging
      .getLogger()
      .info({ route: '/install' }, 'Install page requested');

    return context.json({
      installed: false,
      settings,
    });
  });

  app.route('/install', routes);
}

import type { AppPluginApplication } from '@nocobase/app-server-kit/plugins';
import type { ConfigPaths } from '@nocobase/app-server-kit/config';
import { Hono } from 'hono';

import {
  configureInstallation,
  InstallConfigurationError,
} from '../configure.js';
import { isInstallModeAuthSecret } from '../install-mode.js';

export interface InstallPluginConfig {
  readonly app: {
    readonly name: string | undefined;
    readonly publicBasePath: string;
  };
  readonly auth: {
    readonly secret?: string;
  };
}

export type InstallPluginRoutesApplication =
  AppPluginApplication<InstallPluginConfig>;

export interface CreateInstallRoutesOptions {
  readonly paths: ConfigPaths;
  readonly generateSecret?: () => string;
}

export interface InstallStatusResponse {
  readonly installed: boolean;
}

export function createInstallRoutes(options: CreateInstallRoutesOptions): Hono {
  const routes = new Hono();
  routes.post('/configure', async (context) => {
    context.header('Cache-Control', 'no-store');
    let input: unknown;
    try {
      input = await context.req.json();
    } catch {
      return context.json(
        { message: 'The request body must contain valid JSON.' },
        400,
      );
    }

    try {
      const result = await configureInstallation(input, options);
      return context.json(result, 201);
    } catch (error) {
      if (error instanceof InstallConfigurationError) {
        return context.json({ message: error.message }, error.status);
      }
      throw error;
    }
  });
  return routes;
}

export default function registerInstallRoutes(
  { config, paths }: InstallPluginRoutesApplication,
  router: Hono,
): void {
  const installMode = isInstallModeAuthSecret(config.auth.secret);

  router.get('/install/status', (context) => {
    context.header('Cache-Control', 'no-store');
    return context.json<InstallStatusResponse>({ installed: !installMode });
  });

  if (!installMode) {
    return;
  }

  router.use('*', async (context, next) => {
    const isInstallRequest =
      context.req.path === '/install' ||
      context.req.path.startsWith('/install/');
    const isHtmlNavigation =
      context.req.method === 'GET' &&
      context.req.header('Accept')?.includes('text/html');
    if (isInstallRequest || !isHtmlNavigation) {
      await next();
      return;
    }

    return context.redirect('/install');
  });
  router.route('/install', createInstallRoutes({ paths }));
}

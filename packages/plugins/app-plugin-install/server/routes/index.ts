import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import type { ConfigPaths } from '@nocobase/app-server/config';
import {
  defineRootRoutes,
  type AppRootRouteContribution,
} from '@nocobase/app-server/router';
import { Hono } from 'hono';
import { installAuditToken, type InstallAuditBridge } from '../audit.js';

import {
  configureInstallation,
  InstallConfigurationError,
} from '../configure.js';
import { isInstallModeAuthSecret } from '../install-mode.js';
import {
  authenticationConfig,
  resolveAuthSecret,
} from '@nocobase/app-plugin-authentication/server';

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
  readonly audit?: InstallAuditBridge;
}

export interface InstallStatusResponse {
  readonly installed: boolean;
}

export function createInstallRoutes(options: CreateInstallRoutesOptions): Hono {
  const routes = new Hono();
  if (options.audit) {
    routes.post(
      '/configure',
      options.audit.http({ action: 'install.configure' }),
    );
  }
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

    // Installation config is a filesystem operation, not a database transaction.
    // Only a required deployment policy blocks configuration on missing evidence.
    if (options.audit) {
      try {
        const receipt = await options.audit.record({
          action: 'install.configure.attempted',
          outcome: 'accepted',
        });
        if (receipt.state !== 'committed' && options.audit.required) {
          return context.json(
            { message: 'Installation audit is not ready.' },
            503,
          );
        }
      } catch {
        if (options.audit.required)
          return context.json(
            { message: 'Installation audit is not ready.' },
            503,
          );
        console.error('Installation audit observation unavailable.', {
          code: 'INSTALL_AUDIT_WRITE_FAILED',
        });
      }
    }
    try {
      const result = await configureInstallation(input, options);
      await observeConfiguration(options.audit, 'success');
      return context.json(result, 201);
    } catch (error) {
      await observeConfiguration(options.audit, 'failed');
      if (error instanceof InstallConfigurationError) {
        return context.json({ message: error.message }, error.status);
      }
      throw error;
    }
  });
  return routes;
}

export const rootRoutes: AppRootRouteContribution<InstallPluginRoutesApplication> =
  defineRootRoutes(({ config, paths, container }) => {
    const router = new Hono();
    const installMode = isInstallModeAuthSecret(
      resolveAuthSecret(config.get(authenticationConfig).secret, paths.root()),
    );

    router.get('/install/status', (context) => {
      context.header('Cache-Control', 'no-store');
      return context.json<InstallStatusResponse>({ installed: !installMode });
    });

    if (!installMode) {
      return router;
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
    router.route(
      '/install',
      createInstallRoutes({
        paths,
        audit: container.has(installAuditToken)
          ? container.resolve(installAuditToken)
          : undefined,
      }),
    );
    return router;
  });

const routes: readonly AppRootRouteContribution<InstallPluginRoutesApplication>[] =
  [rootRoutes];

export default routes;

async function observeConfiguration(
  audit: InstallAuditBridge | undefined,
  outcome: 'success' | 'failed',
): Promise<void> {
  if (!audit) return;
  try {
    const receipt = await audit.record({
      action:
        outcome === 'success'
          ? 'install.configure.completed'
          : 'install.configure.failed',
      outcome,
      details: {
        phase: 'configuration-file',
        restartRequired: outcome === 'success',
      },
    });
    if (receipt.state !== 'committed') {
      console.error('Installation audit observation unavailable.', {
        code: 'INSTALL_AUDIT_WRITE_FAILED',
      });
    }
  } catch {
    // Never replay or misreport an already completed exclusive configuration write.
    console.error('Installation audit observation unavailable.', {
      code: 'INSTALL_AUDIT_WRITE_FAILED',
    });
  }
}

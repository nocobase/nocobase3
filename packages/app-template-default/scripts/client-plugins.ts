import type { Plugin } from 'vite';

import {
  resolveAppPlugins,
  type ResolvedAppPlugin,
} from '../server/plugins/index.js';

export const APP_CLIENT_PLUGINS_MODULE_ID =
  'virtual:nocobase-app-client-plugins';
const RESOLVED_APP_CLIENT_PLUGINS_MODULE_ID = `\0${APP_CLIENT_PLUGINS_MODULE_ID}`;

export interface AppClientPluginsPluginOptions {
  root: string;
}

export function appClientPluginsPlugin(
  options: AppClientPluginsPluginOptions,
): Plugin {
  return {
    name: 'nocobase-app-client-plugins',
    resolveId(id): string | undefined {
      return id === APP_CLIENT_PLUGINS_MODULE_ID
        ? RESOLVED_APP_CLIENT_PLUGINS_MODULE_ID
        : undefined;
    },
    load(id): string | undefined {
      if (id !== RESOLVED_APP_CLIENT_PLUGINS_MODULE_ID) {
        return undefined;
      }

      return createAppClientPluginLoadersSource(
        resolveAppPlugins(options.root).plugins,
      );
    },
  };
}

export function createAppClientPluginLoadersSource(
  plugins: readonly ResolvedAppPlugin[],
): string {
  const loaders = plugins.flatMap((plugin) => {
    const client = plugin.manifest.client;
    if (!plugin.enabled || !client) {
      return [];
    }

    return [
      {
        packageName: plugin.packageName,
        bootstrapModuleId: resolveOptionalClientModuleId(
          plugin.packageName,
          client.bootstrap,
          'bootstrap',
        ),
        routesModuleId: resolveOptionalClientModuleId(
          plugin.packageName,
          client.routes,
          'routes',
        ),
        providersModuleId: resolveOptionalClientModuleId(
          plugin.packageName,
          client.providers,
          'providers',
        ),
      },
    ];
  });
  const entries = loaders
    .map(
      ({
        bootstrapModuleId,
        packageName,
        providersModuleId,
        routesModuleId,
      }) => `  {
    packageName: ${JSON.stringify(packageName)},${
      bootstrapModuleId
        ? `
    loadBootstrap: () => import(${JSON.stringify(bootstrapModuleId)}),`
        : ''
    }${
      routesModuleId
        ? `
    loadRoutes: () => import(${JSON.stringify(routesModuleId)}),`
        : ''
    }${
      providersModuleId
        ? `
    loadProviders: () => import(${JSON.stringify(providersModuleId)}),`
        : ''
    }
  }`,
    )
    .join(',\n');

  return `export const appClientPluginLoaders = [\n${entries}\n];\n`;
}

function resolveOptionalClientModuleId(
  packageName: string,
  clientEntry: string | undefined,
  contribution: string,
): string {
  if (clientEntry === undefined) {
    return '';
  }
  if (
    !clientEntry.startsWith('./') ||
    clientEntry.includes('\\') ||
    clientEntry.split('/').includes('..')
  ) {
    throw new Error(
      `Plugin "${packageName}" client ${contribution} entry must be a safe package subpath beginning with "./".`,
    );
  }

  const subpath = clientEntry.slice(2);
  if (!subpath) {
    throw new Error(`Plugin "${packageName}" client entry cannot be empty.`);
  }

  return `${packageName}/${subpath}`;
}

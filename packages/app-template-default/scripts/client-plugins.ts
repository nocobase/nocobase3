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
    const clientEntry = plugin.manifest.client;
    if (!plugin.enabled || !clientEntry) {
      return [];
    }

    return [
      {
        packageName: plugin.packageName,
        moduleId: resolveClientModuleId(plugin.packageName, clientEntry),
      },
    ];
  });
  const entries = loaders
    .map(
      ({ packageName, moduleId }) => `  {
    packageName: ${JSON.stringify(packageName)},
    load: () => import(${JSON.stringify(moduleId)}),
  }`,
    )
    .join(',\n');

  return `export const appClientPluginLoaders = [\n${entries}\n];\n`;
}

function resolveClientModuleId(
  packageName: string,
  clientEntry: string,
): string {
  if (
    !clientEntry.startsWith('./') ||
    clientEntry.includes('\\') ||
    clientEntry.split('/').includes('..')
  ) {
    throw new Error(
      `Plugin "${packageName}" client entry must be a safe package subpath beginning with "./".`,
    );
  }

  const subpath = clientEntry.slice(2);
  if (!subpath) {
    throw new Error(`Plugin "${packageName}" client entry cannot be empty.`);
  }

  return `${packageName}/${subpath}`;
}

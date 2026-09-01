import { AppConfig, type AppConfigContribution } from '../config/index.js';

import type {
  Application,
  ApplicationServiceProviderConstructor,
} from '../application/index.js';
import {
  createConfigContext,
  type ConfigContext,
  type ConfigPaths,
} from '../config/index.js';
import {
  resolveAppServerPlugins,
  type AppServerPlugins,
  type ResolvedAppServerPlugins,
} from '../plugins/index.js';
import type { AppRouteContribution } from '../router/index.js';
import {
  createAppConfigPaths,
  resolveAppScopeRuntime,
  type ResolvedAppScopeRuntime,
} from './scope.js';
import type { AppPathOptions, AppScope } from './types.js';

export type AppRuntimeConfig = object;

export interface AppRuntimeConfigContext extends ConfigContext {
  readonly mode?: 'standalone' | 'embedded';
  readonly routing?: ResolvedAppScopeRuntime['routing'];
  readonly runtimePaths?: AppPathOptions;
  readonly plugins?: ResolvedAppServerPlugins;
  readonly appPackageName?: string;
  readonly configPath?: string;
}

export interface ResolvedAppRuntimeConfigContext extends AppRuntimeConfigContext {
  readonly mode: 'standalone' | 'embedded';
  readonly routing: ResolvedAppScopeRuntime['routing'];
  readonly runtimePaths: AppPathOptions;
  readonly plugins: ResolvedAppServerPlugins;
  readonly appPackageName: string;
  readonly configPath: string | undefined;
  readonly configs: readonly AppConfigContribution<ResolvedAppRuntimeConfigContext>[];
}

export interface AppRuntimeDefinition {
  readonly config: (
    context: ResolvedAppRuntimeConfigContext,
  ) => AppConfig | Promise<AppConfig>;
  readonly plugins: AppServerPlugins;
  readonly serviceProviders: readonly ApplicationServiceProviderConstructor[];
  readonly routes: readonly AppRouteContribution<Application>[];
}

export interface ResolvedAppRuntime extends ResolvedAppScopeRuntime {
  readonly scope: AppScope;
  readonly configPaths: ConfigPaths;
  readonly plugins: ResolvedAppServerPlugins;
  readonly serviceProviders: readonly ApplicationServiceProviderConstructor[];
  readonly routes: readonly AppRouteContribution<Application>[];
  readonly appConfig: AppConfig;
}

export function defineAppRuntime(
  definition: AppRuntimeDefinition,
): AppRuntimeDefinition {
  return Object.freeze({
    ...definition,
    serviceProviders: Object.freeze([...definition.serviceProviders]),
    routes: Object.freeze([...definition.routes]),
  });
}

export async function resolveAppRuntime(
  definition: AppRuntimeDefinition,
  scope: AppScope,
): Promise<ResolvedAppRuntime> {
  const base = resolveAppScopeRuntime(scope);
  const context = createAppRuntimeConfigContext(definition, scope, base);
  const appConfig = await definition.config(context);
  await appConfig.loadAll();

  return {
    ...base,
    scope,
    configPaths: context.paths,
    plugins: context.plugins,
    serviceProviders: definition.serviceProviders,
    routes: definition.routes,
    appConfig,
  };
}

function createAppRuntimeConfigContext(
  definition: AppRuntimeDefinition,
  scope: AppScope,
  runtime: ResolvedAppScopeRuntime,
): ResolvedAppRuntimeConfigContext {
  const configPaths = createAppConfigPaths(runtime.paths);
  const plugins = resolveAppServerPlugins(
    runtime.paths.rootDir,
    definition.plugins,
  );
  const configs = plugins.plugins.flatMap(
    (plugin) => plugin.definition.config,
  ) as unknown as readonly AppConfigContribution<ResolvedAppRuntimeConfigContext>[];

  return {
    ...createConfigContext({ env: runtime.env, paths: configPaths }),
    mode: runtime.mode,
    routing: runtime.routing,
    runtimePaths: runtime.paths,
    plugins,
    appPackageName: plugins.appPackageName,
    configPath: scope.configPath,
    configs,
  };
}

import type {
  Application,
  ApplicationConfig,
  ApplicationServiceProviderConstructor,
} from '../application/index.js';
import {
  createConfigContext,
  loadConfig,
  type ConfigContext,
  type ConfigFactories,
  type ConfigFactory,
  type ConfigPaths,
} from '../config/index.js';
import {
  resolveAppServerPlugins,
  type AppServerPlugins,
  type ResolvedAppPlugin,
  type ResolvedAppServerPlugins,
} from '../plugins/index.js';
import type { AppApiRoutes, AppRootRoutes } from '../router/index.js';
import {
  createAppConfigPaths,
  resolveAppScopeRuntime,
  type ResolvedAppScopeRuntime,
} from './scope.js';
import type { AppPathOptions, AppScope } from './types.js';

export interface AppRuntimeConfig extends ApplicationConfig {
  readonly plugins: readonly ResolvedAppPlugin[];
}

export type AppRuntimeConfigSections<TConfig extends AppRuntimeConfig> = Omit<
  TConfig,
  'plugins'
>;

export type ResolvedAppRuntimeConfig<TConfig extends AppRuntimeConfig> =
  AppRuntimeConfigSections<TConfig> & {
    readonly plugins: TConfig['plugins'];
  };

export interface AppRuntimeConfigContext<
  TConfig extends AppRuntimeConfig = AppRuntimeConfig,
  TScopeConfig = unknown,
> extends ConfigContext {
  readonly mode?: 'standalone' | 'embedded';
  readonly scopeConfig?: TScopeConfig;
  readonly routing?: ResolvedAppScopeRuntime['routing'];
  readonly runtimePaths?: AppPathOptions;
  readonly plugins?: ResolvedAppServerPlugins<TConfig>;
  readonly appPackageName?: string;
}

export interface ResolvedAppRuntimeConfigContext<
  TConfig extends AppRuntimeConfig = AppRuntimeConfig,
  TScopeConfig = unknown,
> extends AppRuntimeConfigContext<TConfig, TScopeConfig> {
  readonly mode: 'standalone' | 'embedded';
  readonly scopeConfig: TScopeConfig | undefined;
  readonly routing: ResolvedAppScopeRuntime['routing'];
  readonly runtimePaths: AppPathOptions;
  readonly plugins: ResolvedAppServerPlugins<TConfig>;
  readonly appPackageName: string;
}

export type AppRuntimeConfigFactory<
  TSection,
  TConfig extends AppRuntimeConfig = AppRuntimeConfig,
  TScopeConfig = unknown,
> = ConfigFactory<TSection, AppRuntimeConfigContext<TConfig, TScopeConfig>>;

export type AppRuntimeConfigFactories<
  TConfig extends AppRuntimeConfig,
  TScopeConfig = unknown,
> = ConfigFactories<
  AppRuntimeConfigSections<TConfig>,
  AppRuntimeConfigContext<TConfig, TScopeConfig>
>;

export interface AppRuntimeDefinition<
  TConfig extends AppRuntimeConfig = AppRuntimeConfig,
  TScopeConfig = unknown,
> {
  readonly config: AppRuntimeConfigFactories<TConfig, TScopeConfig>;
  readonly plugins: AppServerPlugins<TConfig>;
  readonly providers: readonly ApplicationServiceProviderConstructor<TConfig>[];
  readonly apiRoutes: readonly AppApiRoutes<Application<TConfig>>[];
  readonly rootRoutes: readonly AppRootRoutes<Application<TConfig>>[];
}

export interface ResolvedAppRuntime<
  TConfig extends AppRuntimeConfig = AppRuntimeConfig,
  TScopeConfig = unknown,
> extends ResolvedAppScopeRuntime {
  readonly scope: AppScope<TScopeConfig>;
  readonly configPaths: ConfigPaths;
  readonly plugins: ResolvedAppServerPlugins<TConfig>;
  readonly providers: readonly ApplicationServiceProviderConstructor<TConfig>[];
  readonly apiRoutes: readonly AppApiRoutes<Application<TConfig>>[];
  readonly rootRoutes: readonly AppRootRoutes<Application<TConfig>>[];
  readonly config: ResolvedAppRuntimeConfig<TConfig>;
}

export interface ResolvedAppRuntimeConfigSection<
  TConfig extends AppRuntimeConfig,
  TScopeConfig,
  TKey extends keyof AppRuntimeConfigSections<TConfig>,
> extends ResolvedAppScopeRuntime {
  readonly scope: AppScope<TScopeConfig>;
  readonly configPaths: ConfigPaths;
  readonly plugins: ResolvedAppServerPlugins<TConfig>;
  readonly config: AppRuntimeConfigSections<TConfig>[TKey];
}

export function defineAppRuntime<
  TConfig extends AppRuntimeConfig,
  TScopeConfig = unknown,
>(
  definition: AppRuntimeDefinition<TConfig, TScopeConfig>,
): AppRuntimeDefinition<TConfig, TScopeConfig> {
  return definition;
}

export function resolveAppRuntime<
  TConfig extends AppRuntimeConfig,
  TScopeConfig = unknown,
>(
  definition: AppRuntimeDefinition<TConfig, TScopeConfig>,
  scope: AppScope<TScopeConfig>,
): ResolvedAppRuntime<TConfig, TScopeConfig> {
  const base = resolveAppScopeRuntime(scope);
  const context = createAppRuntimeConfigContext(definition, scope, base);
  const sections = loadConfig(definition.config, context);
  const config: ResolvedAppRuntimeConfig<TConfig> = Object.assign(sections, {
    plugins: context.plugins.plugins.map((plugin) => plugin.metadata),
  });

  return {
    ...base,
    scope,
    configPaths: context.paths,
    plugins: context.plugins,
    providers: definition.providers,
    apiRoutes: definition.apiRoutes,
    rootRoutes: definition.rootRoutes,
    config,
  };
}

export function resolveAppRuntimeConfigSection<
  TConfig extends AppRuntimeConfig,
  TScopeConfig,
  TKey extends keyof AppRuntimeConfigSections<TConfig>,
>(
  definition: AppRuntimeDefinition<TConfig, TScopeConfig>,
  scope: AppScope<TScopeConfig>,
  key: TKey,
): ResolvedAppRuntimeConfigSection<TConfig, TScopeConfig, TKey> {
  const base = resolveAppScopeRuntime(scope);
  const context = createAppRuntimeConfigContext(definition, scope, base);
  return {
    ...base,
    scope,
    configPaths: context.paths,
    plugins: context.plugins,
    config: definition.config[key](context),
  };
}

function createAppRuntimeConfigContext<
  TConfig extends AppRuntimeConfig,
  TScopeConfig,
>(
  definition: AppRuntimeDefinition<TConfig, TScopeConfig>,
  scope: AppScope<TScopeConfig>,
  runtime: ResolvedAppScopeRuntime,
): ResolvedAppRuntimeConfigContext<TConfig, TScopeConfig> {
  const configPaths = createAppConfigPaths(runtime.paths);
  const plugins = resolveAppServerPlugins(
    runtime.paths.rootDir,
    definition.plugins,
  );

  return {
    ...createConfigContext({ env: runtime.env, paths: configPaths }),
    mode: runtime.mode,
    scopeConfig: scope.config,
    routing: runtime.routing,
    runtimePaths: runtime.paths,
    plugins,
    appPackageName: plugins.appPackageName,
  };
}

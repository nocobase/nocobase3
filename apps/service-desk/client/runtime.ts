import type { AppClientRefineConfig } from '@nocobase/app-client';
import {
  applyClientRouteComponentOverrides,
  resolveAppClientContributions,
  type AppClientApplicationLoader,
  type AppClientBootstrap,
  type AppClientContributionSource,
  type AppClientPluginLoader,
  type AppClientProviderDefinition,
  type AppClientRegisteredRoute,
  type AppClientRouteComponentOverrideDefinition,
  type AppClientRouteDefinition,
} from '@nocobase/app-client/plugins';
import { createAppClient, type AppClient } from '@nocobase/app-sdk';
import { getPortalBase } from '@nocobase/portal-sdk/runtime';
import type { AuthProvider, ResourceProps } from '@refinedev/core';

export interface ServiceDeskClientRuntime {
  appClient: AppClient;
  authProvider: AuthProvider;
  basename: string;
  dataProvider: NonNullable<AppClientRefineConfig['dataProvider']>;
  notificationProvider?: AppClientRefineConfig['notificationProvider'];
  providers: readonly AppClientProviderDefinition[];
  resources: ResourceProps[];
  routes: readonly AppClientRegisteredRoute[];
}

export async function createServiceDeskClientRuntime(
  application: AppClientApplicationLoader,
  plugins: readonly AppClientPluginLoader[],
  overrides: readonly AppClientRouteComponentOverrideDefinition[] = [],
): Promise<ServiceDeskClientRuntime> {
  const appClient = createAppClient();
  const resources: ResourceProps[] = [];
  let authProvider: AuthProvider | undefined;
  let dataProvider: AppClientRefineConfig['dataProvider'];
  let notificationProvider: AppClientRefineConfig['notificationProvider'];
  const loaded = await Promise.all([
    ...plugins.map((plugin) => load({ ...plugin, source: 'plugin' })),
    load(application),
  ]);
  for (const contribution of loaded) {
    await contribution.bootstrap?.({
      appClient,
      packageName: contribution.packageName,
      source: contribution.source,
      refine: {
        addResources: (value) => resources.push(...value),
        setAuthProvider: (value) => {
          authProvider = value;
        },
        setDataProvider: (value) => {
          dataProvider = value;
        },
        setNotificationProvider: (value) => {
          notificationProvider = value;
        },
        setOptions: () => undefined,
        setChildren: () => undefined,
        setRouterProvider: () => undefined,
        setResources: (value) => {
          resources.splice(0, resources.length, ...value);
        },
        setLiveProvider: () => undefined,
        setAccessControlProvider: () => undefined,
        setAuditLogProvider: () => undefined,
        setI18nProvider: () => undefined,
        setOnLiveEvent: () => undefined,
        addLiveEventHandler: () => undefined,
      },
    });
  }
  if (!authProvider || !dataProvider)
    throw new Error('服务台 App 缺少认证或数据访问插件。');
  const contributions = resolveAppClientContributions(loaded);
  return {
    appClient,
    authProvider,
    basename: getPortalBase(),
    dataProvider,
    notificationProvider,
    providers: contributions.providers,
    resources,
    routes: applyClientRouteComponentOverrides(contributions.routes, overrides),
  };
}

interface LoadedContribution {
  packageName: string;
  source: AppClientContributionSource;
  bootstrap?: AppClientBootstrap;
  providers?: readonly AppClientProviderDefinition[];
  routes?: readonly AppClientRouteDefinition[];
}

async function load(
  contribution:
    AppClientApplicationLoader | (AppClientPluginLoader & { source: 'plugin' }),
): Promise<LoadedContribution> {
  const [bootstrap, routes, providers] = await Promise.all([
    contribution.loadBootstrap?.().then((module) => module.default),
    contribution.loadRoutes?.().then((module) => module.default),
    contribution.loadProviders?.().then((module) => module.default),
  ]);
  return {
    packageName: contribution.packageName,
    source: contribution.source,
    bootstrap,
    routes,
    providers,
  };
}

import type { Hono } from 'hono';
import type {
  ServiceContainer,
  ServiceProviderConstructor,
  ServiceResolver,
} from '@nocobase/service-provider';
import type { ApplicationConfig } from '../application/index.js';
import type { ConfigPaths } from '../config/index.js';

export interface AppPluginProviderApplication<
  TConfig extends ApplicationConfig = ApplicationConfig,
> {
  readonly appName: string;
  readonly publicBasePath: string;
  readonly config: TConfig;
  readonly paths: ConfigPaths;
  readonly container: ServiceContainer;
}

export type AppPluginProviderConstructor<
  TConfig extends ApplicationConfig = ApplicationConfig,
> = ServiceProviderConstructor<AppPluginProviderApplication<TConfig>>;

export interface AppPluginRoutesApplication<
  TConfig extends ApplicationConfig = ApplicationConfig,
> {
  readonly appName: string;
  readonly publicBasePath: string;
  readonly config: TConfig;
  readonly paths: ConfigPaths;
  readonly router: Hono;
  readonly container: ServiceResolver;
}

export type AppPluginRoutesRegistrar<
  TConfig extends ApplicationConfig = ApplicationConfig,
> = (app: AppPluginRoutesApplication<TConfig>) => void;

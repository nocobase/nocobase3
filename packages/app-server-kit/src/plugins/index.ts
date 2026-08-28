import type { Hono } from 'hono';
import type {
  ServiceProviderConstructor,
  ServiceResolver,
} from '@nocobase/service-provider';
import type { AppRuntime } from '../runtime/index.js';
import type { ConfigPaths } from '../config/index.js';

export type AppPluginProviderConstructor<TConfig = unknown> =
  ServiceProviderConstructor<AppRuntime<TConfig>>;

export interface AppPluginRoutesContext<TConfig = unknown> {
  readonly appName: string;
  readonly publicBasePath: string;
  readonly config: TConfig;
  readonly paths: ConfigPaths;
  readonly router: Hono;
  readonly runtime: AppRuntime<TConfig>;
  readonly serviceContainer: ServiceResolver;
}

export type AppPluginRoutesRegistrar<TConfig = unknown> = (
  context: AppPluginRoutesContext<TConfig>,
) => void;

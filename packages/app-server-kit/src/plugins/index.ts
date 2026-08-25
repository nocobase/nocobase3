import type { Hono } from 'hono';
import type { AppRuntime } from '../runtime/index.js';
import type { AppPluginServiceRegistry } from './services.js';

export interface AppPluginRoutesContext<
  TDeps = unknown,
  TServices = unknown,
  TRuntime extends AppRuntime = AppRuntime,
> {
  readonly app: Hono;
  readonly deps: TDeps;
  readonly pluginServices: AppPluginServiceRegistry;
  readonly runtime: TRuntime;
  readonly services: TServices;
}

export type AppPluginDisposer = () => void | Promise<void>;

export interface AppPluginLifecycle {
  registerDisposer(name: string, dispose: AppPluginDisposer): void;
}

export interface AppPluginServerContext<
  TDeps = unknown,
  TServices = unknown,
  TRuntime extends AppRuntime = AppRuntime,
> {
  readonly deps: TDeps;
  readonly pluginServices: AppPluginServiceRegistry;
  readonly runtime: TRuntime;
  readonly services: TServices;
  readonly lifecycle: AppPluginLifecycle;
}

export type AppPluginBootstrap<
  TDeps = unknown,
  TServices = unknown,
  TRuntime extends AppRuntime = AppRuntime,
> = (context: AppPluginServerContext<TDeps, TServices, TRuntime>) => void;

export type AppPluginRoutesRegistrar<
  TDeps = unknown,
  TServices = unknown,
  TRuntime extends AppRuntime = AppRuntime,
> = (context: AppPluginRoutesContext<TDeps, TServices, TRuntime>) => void;

export {
  AppPluginServiceRegistry,
  createAppPluginServiceRegistry,
  createAppPluginServiceToken,
  type AppPluginServiceToken,
} from './services.js';

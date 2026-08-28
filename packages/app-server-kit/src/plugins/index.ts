import type { Hono } from 'hono';
import type { ConfigPaths } from '../config/types.js';

export interface AppPluginRoutesContext<
  TDeps = unknown,
  TServices = unknown,
  TConfig = unknown,
> {
  readonly app: Hono;
  readonly config: TConfig;
  readonly deps: TDeps;
  readonly services: TServices;
  readonly paths: ConfigPaths;
}

export type AppPluginDisposer = () => void | Promise<void>;

export interface AppPluginLifecycle {
  registerDisposer(name: string, dispose: AppPluginDisposer): void;
}

export interface AppPluginServerContext<
  TDeps = unknown,
  TServices = unknown,
  TConfig = unknown,
> {
  readonly config: TConfig;
  readonly deps: TDeps;
  readonly services: TServices;
  readonly lifecycle: AppPluginLifecycle;
}

export type AppPluginBootstrap<
  TDeps = unknown,
  TServices = unknown,
  TConfig = unknown,
> = (context: AppPluginServerContext<TDeps, TServices, TConfig>) => void;

export type AppPluginRoutesRegistrar<
  TDeps = unknown,
  TServices = unknown,
  TConfig = unknown,
> = (context: AppPluginRoutesContext<TDeps, TServices, TConfig>) => void;

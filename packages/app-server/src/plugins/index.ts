import type { Hono } from 'hono';

export interface AppPluginRoutesContext<TDeps = unknown, TServices = unknown> {
  readonly app: Hono;
  readonly deps: TDeps;
  readonly services: TServices;
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
  readonly deps: TDeps;
  readonly services: TServices;
  readonly config?: TConfig;
  readonly lifecycle: AppPluginLifecycle;
}

export type AppPluginBootstrap<
  TDeps = unknown,
  TServices = unknown,
  TConfig = unknown,
> = (context: AppPluginServerContext<TDeps, TServices, TConfig>) => void;

export type AppPluginRoutesRegistrar<TDeps = unknown, TServices = unknown> = (
  context: AppPluginRoutesContext<TDeps, TServices>,
) => void;

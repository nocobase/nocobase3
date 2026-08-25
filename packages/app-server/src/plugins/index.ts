import type { Env, Hono, Schema } from 'hono';

export interface AppPluginProtectedRoutes {
  route<E extends Env, S extends Schema, B extends string>(
    path: string,
    app: Hono<E, S, B>,
  ): void;
}

export interface AppPluginRoutesContext<TDeps = unknown, TServices = unknown> {
  readonly app: Hono;
  readonly api: Hono;
  readonly protectedRoutes: AppPluginProtectedRoutes;
  readonly deps: TDeps;
  readonly services: TServices;
}

export type AppPluginDisposer = () => void | Promise<void>;

export interface AppPluginLifecycle {
  registerDisposer(name: string, dispose: AppPluginDisposer): void;
}

export interface AppPluginServerContext<TDeps = unknown, TServices = unknown> {
  readonly deps: TDeps;
  readonly services: TServices;
  readonly lifecycle: AppPluginLifecycle;
}

export type AppPluginBootstrap<TDeps = unknown, TServices = unknown> = (
  context: AppPluginServerContext<TDeps, TServices>,
) => void;

export type AppPluginRoutesRegistrar<TDeps = unknown, TServices = unknown> = (
  context: AppPluginRoutesContext<TDeps, TServices>,
) => void;

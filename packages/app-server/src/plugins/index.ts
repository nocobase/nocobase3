import type { Hono } from 'hono';

export interface AppPluginRoutesContext<TDeps = unknown, TServices = unknown> {
  readonly app: Hono;
  readonly deps: TDeps;
  readonly services: TServices;
}

export type AppPluginRoutesRegistrar<TDeps = unknown, TServices = unknown> = (
  context: AppPluginRoutesContext<TDeps, TServices>,
) => void;

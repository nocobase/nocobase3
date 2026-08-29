import type { Hono } from 'hono';

export type AppRouterFactory<TApplication> = (
  app: TApplication,
) => Hono | Promise<Hono>;

export type AppHttpMiddlewareRegister<TApplication> = (
  router: Hono,
  app: TApplication,
) => void | Promise<void>;

export interface AppHttpMiddleware<TApplication> {
  readonly name: string;
  readonly register: AppHttpMiddlewareRegister<TApplication>;
}

export interface AppApiRouteContribution<TApplication> {
  readonly scope: 'api';
  readonly createRouter: AppRouterFactory<TApplication>;
}

export interface AppRootRouteContribution<TApplication> {
  readonly scope: 'root';
  readonly createRouter: AppRouterFactory<TApplication>;
}

export type AppRouteContribution<TApplication> =
  | AppApiRouteContribution<TApplication>
  | AppRootRouteContribution<TApplication>;

export interface DefineHttpMiddlewareOptions<TApplication> {
  readonly name: string;
  readonly register: AppHttpMiddlewareRegister<TApplication>;
}

export function defineHttpMiddleware<TApplication>(
  options: DefineHttpMiddlewareOptions<TApplication>,
): AppHttpMiddleware<TApplication> {
  return Object.freeze({
    name: options.name,
    register: options.register,
  });
}

export function defineApiRoutes<TApplication>(
  createRouter: AppRouterFactory<TApplication>,
): AppApiRouteContribution<TApplication> {
  return Object.freeze({
    scope: 'api',
    createRouter,
  });
}

export function defineRootRoutes<TApplication>(
  createRouter: AppRouterFactory<TApplication>,
): AppRootRouteContribution<TApplication> {
  return Object.freeze({
    scope: 'root',
    createRouter,
  });
}

import type { Hono } from 'hono';

export type AppRoutesRegister<TApplication> = (
  router: Hono,
  app: TApplication,
) => void | Promise<void>;

export interface AppHttpMiddleware<TApplication> {
  readonly name: string;
  readonly register: AppRoutesRegister<TApplication>;
}

export interface AppApiRoutes<TApplication> {
  readonly scope: 'api';
  readonly name: string;
  readonly register: AppRoutesRegister<TApplication>;
}

export interface AppRootRoutes<TApplication> {
  readonly scope: 'root';
  readonly name: string;
  readonly register: AppRoutesRegister<TApplication>;
}

export interface DefineAppRoutesOptions<TApplication> {
  readonly name: string;
  readonly register: AppRoutesRegister<TApplication>;
}

export function defineHttpMiddleware<TApplication>(
  options: DefineAppRoutesOptions<TApplication>,
): AppHttpMiddleware<TApplication> {
  return Object.freeze({
    name: options.name,
    register: options.register,
  });
}

export function defineApiRoutes<TApplication>(
  options: DefineAppRoutesOptions<TApplication>,
): AppApiRoutes<TApplication> {
  return Object.freeze({
    scope: 'api',
    name: options.name,
    register: options.register,
  });
}

export function defineRootRoutes<TApplication>(
  options: DefineAppRoutesOptions<TApplication>,
): AppRootRoutes<TApplication> {
  return Object.freeze({
    scope: 'root',
    name: options.name,
    register: options.register,
  });
}

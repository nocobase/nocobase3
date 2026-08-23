import type { AppClient } from '@nocobase/app-sdk';
import type { AuthProvider } from '@refinedev/core';
import type { ComponentType } from 'react';

export interface AppClientRouteComponentModule {
  default: ComponentType;
}

export type AppClientRouteComponentLoader =
  () => Promise<AppClientRouteComponentModule>;

export interface AppClientRouteRegistration {
  readonly name: string;
  readonly path: string;
  readonly componentLoader: AppClientRouteComponentLoader;
}

export interface AppClientRegisteredRoute extends AppClientRouteRegistration {
  readonly id: string;
  readonly packageName: string;
}

export interface AppClientRouteRegistry {
  add(route: AppClientRouteRegistration): void;
}

export interface AppClientRefineRegistry {
  setAuthProvider(provider: AuthProvider): void;
}

export interface AppClientPluginBootstrapContext {
  readonly appClient: AppClient;
  readonly packageName: string;
  readonly refine: AppClientRefineRegistry;
  readonly routes: AppClientRouteRegistry;
}

export type AppClientPluginBootstrap = (
  context: AppClientPluginBootstrapContext,
) => void | Promise<void>;

export interface AppClientPluginBootstrapModule {
  default: AppClientPluginBootstrap;
}

export interface AppClientPluginLoader {
  readonly packageName: string;
  load(): Promise<AppClientPluginBootstrapModule>;
}

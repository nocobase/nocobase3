import type { RefineProps } from '@refinedev/core';
import type { ComponentType, PropsWithChildren, ReactNode } from 'react';
import type { AppClient } from '@nocobase/app-sdk';

export type AppClientProvider = ComponentType<PropsWithChildren>;

export type AppClientRefineConfig = RefineProps;

export interface AppClientConfig {
  client?: AppClient;
  basename?: string;
  providers?: readonly AppClientProvider[];
  refine?: AppClientRefineConfig;
  routes: ReactNode;
}

export function defineAppClient(config: AppClientConfig): AppClientConfig {
  return config;
}

export function normalizeAppClientBasename(
  basename: string | undefined,
): string | undefined {
  const normalized = basename?.trim();
  if (!normalized || normalized === '/') {
    return undefined;
  }
  return `/${normalized.replace(/^\/+|\/+$/g, '')}`;
}

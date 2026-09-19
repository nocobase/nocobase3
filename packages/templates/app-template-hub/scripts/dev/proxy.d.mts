import type { ProxyOptions } from 'vite';

export function parseProxyTarget(value: string | undefined): URL | undefined;
export function createDevProxy(
  appBase: string,
  value: string | undefined,
): Record<string, ProxyOptions> | undefined;

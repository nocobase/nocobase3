import type { RefineProps } from '@refinedev/core';
import type { ComponentType, PropsWithChildren, ReactNode } from 'react';

const FORBIDDEN_CONFIG_KEYS: ReadonlySet<string> = new Set([
  '__proto__',
  'prototype',
  'constructor',
]);

export type AppClientConfigPrimitive = string | number | boolean | null;

export type AppClientConfigValue =
  | AppClientConfigPrimitive
  | readonly AppClientConfigValue[]
  | AppClientConfigMap;

export interface AppClientConfigMap {
  readonly [key: string]: AppClientConfigValue;
}

export interface AppClientConfig {
  get<T>(path: string): T | undefined;
  get<T>(path: string, defaultValue: T): T;
  has(path: string): boolean;
  raw(): AppClientConfigMap;
}

export interface AppClientConfigContribution {
  readonly namespace: string;
  readonly defaults?: AppClientConfigMap;
  readonly validate?: (config: AppClientConfig) => void | Promise<void>;
}

export interface AppClientConfigContext {
  readonly rawConfig: unknown;
  readonly configs: readonly AppClientConfigContribution[];
}

export type AppClientConfigFactory = (
  context: AppClientConfigContext,
) => AppClientConfig | Promise<AppClientConfig>;

export type AppClientReactProvider = ComponentType<PropsWithChildren>;

export type AppClientRefineConfig = RefineProps;

export interface AppClientRenderConfig {
  readonly basename?: string;
  readonly reactProviders?: readonly AppClientReactProvider[];
  readonly routes: ReactNode;
}

export function defineAppClientConfig(
  contribution: AppClientConfigContribution,
): AppClientConfigContribution {
  const namespace = normalizeConfigPath(contribution.namespace);
  return Object.freeze({
    ...contribution,
    namespace,
    defaults:
      contribution.defaults === undefined
        ? undefined
        : freezeConfigMap(cloneConfigMap(contribution.defaults)),
  });
}

export async function createAppClientConfig(
  context: AppClientConfigContext,
): Promise<AppClientConfig> {
  const rawConfig = assertConfigMap(context.rawConfig, 'Client config');
  let resolved: AppClientConfigMap = {};

  for (const contribution of context.configs) {
    if (contribution.defaults === undefined) {
      continue;
    }
    resolved = mergeConfigMaps(
      resolved,
      mountConfig(contribution.namespace, contribution.defaults),
    );
  }
  resolved = mergeConfigMaps(resolved, rawConfig);

  const config = new ReadonlyAppClientConfig(resolved);
  for (const contribution of context.configs) {
    await contribution.validate?.(config);
  }
  return config;
}

export function defineAppClientRenderConfig(
  config: AppClientRenderConfig,
): AppClientRenderConfig {
  return Object.freeze({
    ...config,
    reactProviders:
      config.reactProviders === undefined
        ? undefined
        : Object.freeze([...config.reactProviders]),
  });
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

class ReadonlyAppClientConfig implements AppClientConfig {
  private readonly value: AppClientConfigMap;

  public constructor(value: AppClientConfigMap) {
    this.value = freezeConfigMap(cloneConfigMap(value));
  }

  public get<T>(path: string): T | undefined;
  public get<T>(path: string, defaultValue: T): T;
  public get<T>(path: string, defaultValue?: T): T | undefined {
    const segments = path ? normalizeConfigPath(path).split('.') : [];
    let value: AppClientConfigValue = this.value;
    for (const segment of segments) {
      if (isConfigArray(value)) {
        if (!/^\d+$/u.test(segment)) {
          return defaultValue;
        }
        const item: AppClientConfigValue | undefined = value[Number(segment)];
        if (item === undefined) {
          return defaultValue;
        }
        value = item;
        continue;
      }
      if (!isConfigMap(value) || !Object.hasOwn(value, segment)) {
        return defaultValue;
      }
      value = value[segment];
    }
    return cloneConfigValue(value) as T;
  }

  public has(path: string): boolean {
    return this.get(path) !== undefined;
  }

  public raw(): AppClientConfigMap {
    return cloneConfigMap(this.value);
  }
}

function normalizeConfigPath(path: string): string {
  const normalized = path.trim();
  if (!normalized) {
    return '';
  }
  const segments = normalized.split('.');
  for (const segment of segments) {
    if (!segment) {
      throw new Error(
        `Client config path "${path}" contains an empty segment.`,
      );
    }
    if (FORBIDDEN_CONFIG_KEYS.has(segment)) {
      throw new Error(
        `Client config path "${path}" contains forbidden segment "${segment}".`,
      );
    }
  }
  return segments.join('.');
}

function assertConfigMap(value: unknown, label: string): AppClientConfigMap {
  assertConfigValue(value, label);
  if (!isConfigMap(value)) {
    throw new Error(`${label} must be a plain object.`);
  }
  return value;
}

function assertConfigValue(value: unknown, path: string): void {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  ) {
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      assertConfigValue(item, `${path}[${index}]`),
    );
    return;
  }
  if (!isConfigMap(value)) {
    throw new Error(
      `${path} values must be JSON-compatible strings, finite numbers, booleans, null, arrays, or plain objects.`,
    );
  }
  for (const [key, item] of Object.entries(value)) {
    if (FORBIDDEN_CONFIG_KEYS.has(key)) {
      throw new Error(`${path} contains forbidden key "${key}".`);
    }
    assertConfigValue(item, `${path}.${key}`);
  }
}

function isConfigMap(value: unknown): value is AppClientConfigMap {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null)
  );
}

function isConfigArray(
  value: AppClientConfigValue,
): value is readonly AppClientConfigValue[] {
  return Array.isArray(value);
}

function cloneConfigMap(value: AppClientConfigMap): AppClientConfigMap {
  return cloneConfigValue(value) as AppClientConfigMap;
}

function cloneConfigValue(value: AppClientConfigValue): AppClientConfigValue {
  if (isConfigArray(value)) {
    return value.map((item) => cloneConfigValue(item));
  }
  if (isConfigMap(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, cloneConfigValue(item)]),
    );
  }
  return value;
}

function freezeConfigMap(value: AppClientConfigMap): AppClientConfigMap {
  return freezeConfigValue(value) as AppClientConfigMap;
}

function freezeConfigValue(value: AppClientConfigValue): AppClientConfigValue {
  if (isConfigArray(value)) {
    value.forEach((item) => freezeConfigValue(item));
  } else if (isConfigMap(value)) {
    Object.values(value).forEach((item) => freezeConfigValue(item));
  }
  return Object.freeze(value);
}

function mountConfig(
  namespace: string,
  defaults: AppClientConfigMap,
): AppClientConfigMap {
  if (!namespace) {
    return defaults;
  }
  const root: Record<string, AppClientConfigValue> = {};
  let target = root;
  const segments = namespace.split('.');
  segments.forEach((segment, index) => {
    if (index === segments.length - 1) {
      target[segment] = defaults;
      return;
    }
    const child: Record<string, AppClientConfigValue> = {};
    target[segment] = child;
    target = child;
  });
  return root;
}

function mergeConfigMaps(
  base: AppClientConfigMap,
  override: AppClientConfigMap,
): AppClientConfigMap {
  const merged: Record<string, AppClientConfigValue> = {
    ...cloneConfigMap(base),
  };
  for (const [key, value] of Object.entries(override)) {
    const current = merged[key];
    merged[key] =
      isConfigMap(current) && isConfigMap(value)
        ? mergeConfigMaps(current, value)
        : cloneConfigValue(value);
  }
  return merged;
}

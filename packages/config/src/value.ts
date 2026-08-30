import { ConfigPathError } from './errors.js';
import type { ConfigMap, ConfigValue } from './types.js';

const forbiddenKeys: ReadonlySet<string> = new Set([
  '__proto__',
  'prototype',
  'constructor',
]);

export function isConfigMap(value: unknown): value is ConfigMap {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null)
  );
}

export function isConfigArray(
  value: ConfigValue,
): value is readonly ConfigValue[] {
  return Array.isArray(value);
}

export function createConfigRecord(): Record<string, ConfigValue> {
  return {};
}

export function assertConfigMap(value: unknown, path: string = ''): ConfigMap {
  assertConfigValue(value, path);
  if (!isConfigMap(value)) {
    throw new ConfigPathError(path, 'the root value must be an object');
  }
  return value;
}

export function assertConfigValue(value: unknown, path: string = ''): void {
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
      assertConfigValue(item, appendPath(path, String(index))),
    );
    return;
  }

  if (!isConfigMap(value)) {
    throw new ConfigPathError(
      path,
      'values must be strings, finite numbers, booleans, null, arrays, or plain objects',
    );
  }

  for (const [key, item] of Object.entries(value)) {
    if (forbiddenKeys.has(key)) {
      throw new ConfigPathError(appendPath(path, key), 'the key is forbidden');
    }
    assertConfigValue(item, appendPath(path, key));
  }
}

export function cloneConfigValue(value: ConfigMap): ConfigMap;
export function cloneConfigValue(value: ConfigValue): ConfigValue;
export function cloneConfigValue(value: ConfigValue): ConfigValue {
  if (isConfigArray(value)) {
    return value.map((item) => cloneConfigValue(item));
  }
  if (isConfigMap(value)) {
    const copy = createConfigRecord();
    for (const [key, item] of Object.entries(value)) {
      copy[key] = cloneConfigValue(item);
    }
    return copy;
  }
  return value;
}

export function freezeConfigValue(value: ConfigMap): ConfigMap;
export function freezeConfigValue(value: ConfigValue): ConfigValue;
export function freezeConfigValue(value: ConfigValue): ConfigValue {
  if (isConfigArray(value)) {
    value.forEach((item) => freezeConfigValue(item));
  } else if (isConfigMap(value)) {
    Object.values(value).forEach((item) => freezeConfigValue(item));
  }
  return Object.freeze(value);
}

export function configValueType(value: ConfigValue | undefined): string {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (isConfigMap(value)) return 'object';
  return typeof value;
}

function appendPath(path: string, key: string): string {
  return path ? `${path}.${key}` : key;
}

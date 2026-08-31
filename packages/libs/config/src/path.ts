import { ConfigPathError } from './errors.js';
import type { ConfigMap, ConfigValue } from './types.js';
import { createConfigRecord, isConfigArray, isConfigMap } from './value.js';

const forbiddenSegments: ReadonlySet<string> = new Set([
  '__proto__',
  'prototype',
  'constructor',
]);

export function splitConfigPath(path: string, delimiter: string): string[] {
  if (!delimiter) throw new ConfigPathError(path, 'delimiter cannot be empty');
  if (!path) return [];
  const segments = path.split(delimiter);
  for (const segment of segments) {
    if (!segment) throw new ConfigPathError(path, 'segments cannot be empty');
    if (forbiddenSegments.has(segment)) {
      throw new ConfigPathError(path, `segment "${segment}" is forbidden`);
    }
  }
  return segments;
}

export function getConfigValue(
  root: ConfigMap,
  segments: readonly string[],
): ConfigValue | undefined {
  let value: ConfigValue = root;
  for (const segment of segments) {
    if (isConfigArray(value)) {
      if (!/^\d+$/.test(segment)) return undefined;
      const item: ConfigValue | undefined = value[Number(segment)];
      if (item === undefined) return undefined;
      value = item;
      continue;
    }
    if (!isConfigMap(value) || !Object.hasOwn(value, segment)) return undefined;
    value = value[segment];
  }
  return value;
}

export function setConfigValue(
  root: Record<string, ConfigValue>,
  segments: readonly string[],
  value: ConfigValue,
): void {
  if (segments.length === 0) {
    throw new ConfigPathError('', 'the root cannot be set with set()');
  }
  let target = root;
  for (const segment of segments.slice(0, -1)) {
    const existing = target[segment];
    if (isConfigMap(existing)) {
      target = existing;
    } else {
      const child = createConfigRecord();
      target[segment] = child;
      target = child;
    }
  }
  target[segments.at(-1) as string] = value;
}

export function deleteConfigValue(
  root: Record<string, ConfigValue>,
  segments: readonly string[],
): void {
  if (segments.length === 0) {
    for (const key of Object.keys(root)) delete root[key];
    return;
  }
  const parents: Array<[Record<string, ConfigValue>, string]> = [];
  let target = root;
  for (const segment of segments.slice(0, -1)) {
    const child = target[segment];
    if (!isConfigMap(child)) return;
    parents.push([target, segment]);
    target = child;
  }
  delete target[segments.at(-1) as string];
  for (const [parent, key] of parents.reverse()) {
    const child = parent[key];
    if (isConfigMap(child) && Object.keys(child).length === 0)
      delete parent[key];
  }
}

export interface ConfigIndex {
  readonly flat: ReadonlyMap<string, ConfigValue>;
  readonly parts: ReadonlyMap<string, readonly string[]>;
}

export function buildConfigIndex(
  root: ConfigMap,
  delimiter: string,
): ConfigIndex {
  const flat = new Map<string, ConfigValue>();
  const parts = new Map<string, readonly string[]>();

  const visit = (value: ConfigValue, path: readonly string[]): void => {
    if (path.length > 0) {
      const key = path.join(delimiter);
      flat.set(key, value);
      parts.set(key, [...path]);
    }
    if (isConfigMap(value)) {
      for (const [key, child] of Object.entries(value)) {
        visit(child, [...path, key]);
      }
    }
  };

  visit(root, []);
  return { flat, parts };
}

import { setConfigValue, splitConfigPath } from '../path.js';
import type {
  ConfigMap,
  ConfigProvider,
  ConfigProviderResult,
} from '../types.js';
import {
  assertConfigMap,
  cloneConfigValue,
  createConfigRecord,
} from '../value.js';

export interface ObjectProviderOptions {
  readonly name?: string;
  readonly delimiter?: string;
  readonly flat?: boolean;
}

export function objectProvider(
  value: ConfigMap,
  options: ObjectProviderOptions = {},
): ConfigProvider {
  const name = options.name ?? 'object';
  const normalized = options.flat
    ? unflatten(value, options.delimiter ?? '.')
    : cloneConfigValue(assertConfigMap(value));

  return {
    name,
    read: async (): Promise<ConfigProviderResult> => ({
      kind: 'map',
      value: cloneConfigValue(normalized),
    }),
  };
}

function unflatten(value: ConfigMap, delimiter: string): ConfigMap {
  const output = createConfigRecord();
  for (const [path, item] of Object.entries(value)) {
    setConfigValue(
      output,
      splitConfigPath(path, delimiter),
      cloneConfigValue(item),
    );
  }
  return output;
}

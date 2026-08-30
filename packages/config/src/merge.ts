import { ConfigMergeError } from './errors.js';
import type { ConfigMap, ConfigValue } from './types.js';
import { cloneConfigValue, configValueType, isConfigMap } from './value.js';

export interface MergeConfigMapsOptions {
  readonly delimiter: string;
  readonly strict: boolean;
  readonly path?: readonly string[];
}

export function mergeConfigMaps(
  destination: ConfigMap,
  source: ConfigMap,
  options: MergeConfigMapsOptions,
): ConfigMap {
  const output = cloneConfigValue(destination) as Record<string, ConfigValue>;
  mergeInto(output, source, options, options.path ?? []);
  return output;
}

function mergeInto(
  destination: Record<string, ConfigValue>,
  source: ConfigMap,
  options: MergeConfigMapsOptions,
  path: readonly string[],
): void {
  for (const [key, next] of Object.entries(source)) {
    const current = destination[key];
    const nextPath = [...path, key];

    if (isConfigMap(current) && isConfigMap(next)) {
      destination[key] = mergeConfigMaps(current, next, {
        ...options,
        path: nextPath,
      });
      continue;
    }

    if (
      options.strict &&
      current !== undefined &&
      configValueType(current) !== configValueType(next)
    ) {
      throw new ConfigMergeError(
        nextPath.join(options.delimiter),
        configValueType(current),
        configValueType(next),
      );
    }

    destination[key] = cloneConfigValue(next);
  }
}

import { setConfigValue, splitConfigPath } from '../path.js';
import type {
  ConfigMap,
  ConfigProvider,
  ConfigProviderResult,
  ConfigValue,
} from '../types.js';
import { createConfigRecord } from '../value.js';

export type Environment = Readonly<Record<string, string | undefined>>;

export interface EnvironmentMapping {
  readonly path: string;
  readonly parse?: (value: string) => ConfigValue;
}

export interface EnvironmentProviderOptions {
  readonly name?: string;
  readonly prefix?: string;
  readonly keyDelimiter?: string;
  readonly pathDelimiter?: string;
  readonly mappings?: Readonly<Record<string, EnvironmentMapping>>;
  readonly transform?: (
    key: string,
    value: string,
  ) => readonly [path: string, value: ConfigValue] | undefined;
}

export function environmentProvider(
  environment: Environment,
  options: EnvironmentProviderOptions = {},
): ConfigProvider {
  return {
    name: options.name ?? 'environment',
    read: async (): Promise<ConfigProviderResult> => ({
      kind: 'map',
      value: readEnvironment(environment, options),
    }),
  };
}

export function envString(path: string): EnvironmentMapping {
  return { path };
}

export function envInteger(path: string): EnvironmentMapping {
  return {
    path,
    parse(value: string): number {
      if (!/^-?\d+$/.test(value.trim())) {
        throw new Error(`Expected an integer, received "${value}".`);
      }
      return Number(value);
    },
  };
}

export function envBoolean(path: string): EnvironmentMapping {
  return {
    path,
    parse(value: string): boolean {
      if (/^(true|1|yes|on)$/i.test(value.trim())) return true;
      if (/^(false|0|no|off)$/i.test(value.trim())) return false;
      throw new Error(`Expected a boolean, received "${value}".`);
    },
  };
}

export function envStrings(
  path: string,
  separator: string = ',',
): EnvironmentMapping {
  return {
    path,
    parse: (value: string): string[] =>
      value
        .split(separator)
        .map((item) => item.trim())
        .filter(Boolean),
  };
}

function readEnvironment(
  environment: Environment,
  options: EnvironmentProviderOptions,
): ConfigMap {
  const output = createConfigRecord();
  const pathDelimiter = options.pathDelimiter ?? '.';

  if (options.mappings) {
    for (const [key, mapping] of Object.entries(options.mappings)) {
      const value = environment[key];
      if (value === undefined) continue;
      setConfigValue(
        output,
        splitConfigPath(mapping.path, pathDelimiter),
        mapping.parse ? mapping.parse(value) : value,
      );
    }
    return output;
  }

  const prefix = options.prefix ?? '';
  const keyDelimiter = options.keyDelimiter ?? '__';
  for (const [key, value] of Object.entries(environment)) {
    if (value === undefined || !key.startsWith(prefix)) continue;
    const transformed = options.transform?.(key, value);
    if (transformed) {
      setConfigValue(
        output,
        splitConfigPath(transformed[0], pathDelimiter),
        transformed[1],
      );
      continue;
    }
    const path = key
      .slice(prefix.length)
      .toLowerCase()
      .split(keyDelimiter)
      .join(pathDelimiter);
    if (!path) continue;
    setConfigValue(output, splitConfigPath(path, pathDelimiter), value);
  }
  return output;
}

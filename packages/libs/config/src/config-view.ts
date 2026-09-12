import { ConfigTypeError } from './errors.js';
import { buildConfigIndex, getConfigValue, splitConfigPath } from './path.js';
import type { ConfigDecoder, ConfigMap, ConfigValue } from './types.js';
import {
  cloneConfigValue,
  configValueType,
  createConfigRecord,
  freezeConfigValue,
  isConfigMap,
} from './value.js';

export class ConfigView {
  protected readonly root: ConfigMap;
  protected readonly delimiter: string;
  private readonly flat: ReadonlyMap<string, ConfigValue>;

  constructor(root: ConfigMap, delimiter: string) {
    this.root = freezeConfigValue(cloneConfigValue(root));
    this.delimiter = delimiter;
    this.flat = buildConfigIndex(this.root, delimiter).flat;
  }

  get(path: string): ConfigValue | undefined {
    const value = path
      ? this.flat.get(path)
      : getConfigValue(this.root, splitConfigPath(path, this.delimiter));
    return value === undefined ? undefined : cloneConfigValue(value);
  }

  has(path: string): boolean {
    return path === '' || this.flat.has(path);
  }

  keys(): readonly string[] {
    return [...this.flat.keys()].sort();
  }

  mapKeys(path: string): readonly string[] {
    const value = this.get(path);
    if (!isConfigMap(value)) return [];
    return Object.keys(value).sort();
  }

  raw(): ConfigMap {
    return cloneConfigValue(this.root);
  }

  all(): Readonly<Record<string, ConfigValue>> {
    const all = createConfigRecord();
    for (const [key, value] of this.flat) all[key] = cloneConfigValue(value);
    return all;
  }

  string(path: string): string | undefined {
    return this.typed(
      path,
      'string',
      (value): value is string => typeof value === 'string',
    );
  }

  integer(path: string): number | undefined {
    return this.typed(
      path,
      'integer',
      (value): value is number =>
        typeof value === 'number' && Number.isInteger(value),
    );
  }

  float(path: string): number | undefined {
    return this.typed(
      path,
      'number',
      (value): value is number => typeof value === 'number',
    );
  }

  boolean(path: string): boolean | undefined {
    return this.typed(
      path,
      'boolean',
      (value): value is boolean => typeof value === 'boolean',
    );
  }

  strings(path: string): readonly string[] | undefined {
    return this.typed(
      path,
      'string array',
      (value): value is readonly string[] =>
        Array.isArray(value) && value.every((item) => typeof item === 'string'),
    );
  }

  duration(path: string): number | undefined {
    const value = this.get(path);
    if (value === undefined) return undefined;
    if (typeof value === 'number' && value >= 0) return value;
    if (typeof value === 'string') {
      const match = value.trim().match(/^(\d+(?:\.\d+)?)\s*(ms|s|m|h|d)$/i);
      if (match) {
        const amount = Number(match[1]);
        const unit = match[2].toLowerCase();
        const multiplier = {
          ms: 1,
          s: 1_000,
          m: 60_000,
          h: 3_600_000,
          d: 86_400_000,
        }[unit];
        return amount * (multiplier as number);
      }
    }
    throw new ConfigTypeError(path, 'duration', configValueType(value));
  }

  parse<T>(decoder: ConfigDecoder<T>, path: string = ''): T {
    const value = this.get(path);
    if (value === undefined) {
      throw new ConfigTypeError(path, 'configuration value', 'undefined');
    }
    return decoder.decode(value);
  }

  private typed<T extends ConfigValue>(
    path: string,
    expected: string,
    predicate: (value: ConfigValue) => value is T,
  ): T | undefined {
    const value = this.get(path);
    if (value === undefined) return undefined;
    if (!predicate(value)) {
      throw new ConfigTypeError(path, expected, configValueType(value));
    }
    return value;
  }
}

import TOML from '@iarna/toml';
import type { ConfigMap, ConfigParser } from '../types.js';
import { assertConfigMap } from '../value.js';

export function tomlParser(): ConfigParser {
  return {
    name: 'toml',
    parse: (input) =>
      assertConfigMap(TOML.parse(new TextDecoder().decode(input))),
    serialize: (value: ConfigMap) =>
      new TextEncoder().encode(TOML.stringify(value as TOML.JsonMap)),
  };
}

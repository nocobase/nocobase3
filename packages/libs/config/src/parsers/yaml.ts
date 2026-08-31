import { TextDecoder, TextEncoder } from 'node:util';

import { parse, stringify } from 'yaml';

import type { ConfigMap, ConfigParser } from '../types.js';
import { assertConfigMap } from '../value.js';

const decoder: TextDecoder = new TextDecoder();
const encoder: TextEncoder = new TextEncoder();

export function yamlParser(): ConfigParser {
  return {
    name: 'yaml',
    parse(input: Uint8Array): ConfigMap {
      return assertConfigMap(parse(decoder.decode(input)) as unknown);
    },
    serialize(value: ConfigMap): Uint8Array {
      return encoder.encode(stringify(value));
    },
  };
}

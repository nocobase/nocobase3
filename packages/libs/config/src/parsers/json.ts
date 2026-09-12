import { TextDecoder, TextEncoder } from 'node:util';

import type { ConfigMap, ConfigParser } from '../types.js';
import { assertConfigMap } from '../value.js';

const decoder: TextDecoder = new TextDecoder();
const encoder: TextEncoder = new TextEncoder();

export function jsonParser(): ConfigParser {
  return {
    name: 'json',
    parse(input: Uint8Array): ConfigMap {
      return assertConfigMap(JSON.parse(decoder.decode(input)) as unknown);
    },
    serialize(value: ConfigMap): Uint8Array {
      return encoder.encode(JSON.stringify(value, null, 2));
    },
  };
}

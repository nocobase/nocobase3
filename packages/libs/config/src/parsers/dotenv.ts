import { TextDecoder, TextEncoder } from 'node:util';

import type { ConfigMap, ConfigParser } from '../types.js';
import { createConfigRecord } from '../value.js';

const decoder: TextDecoder = new TextDecoder();
const encoder: TextEncoder = new TextEncoder();

export function dotenvParser(): ConfigParser {
  return {
    name: 'dotenv',
    parse(input: Uint8Array): ConfigMap {
      const output = createConfigRecord();
      for (const line of decoder.decode(input).split(/\r?\n/)) {
        const match = line.match(
          /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_.-]*)\s*=\s*(.*?)\s*$/,
        );
        if (!match) continue;
        const key = match[1];
        let value = match[2];
        const quote = value[0];
        if (
          (quote === '"' || quote === "'") &&
          value.endsWith(quote) &&
          value.length >= 2
        ) {
          value = value.slice(1, -1);
        } else {
          value = value.replace(/\s+#.*$/, '');
        }
        output[key] = value.replace(/\\n/g, '\n').replace(/\\r/g, '\r');
      }
      return output;
    },
    serialize(value: ConfigMap): Uint8Array {
      const lines = Object.entries(value).map(([key, item]) => {
        if (typeof item !== 'string') {
          throw new Error(`Dotenv value "${key}" must be a string.`);
        }
        return `${key}=${JSON.stringify(item)}`;
      });
      return encoder.encode(`${lines.join('\n')}\n`);
    },
  };
}

import type { z } from 'zod';
import { DataAccessError } from './data-query-policy.js';

/** Bound the complete request, not merely each independently valid array/string. */
export function parseDataInput<T>(schema: z.ZodType<T>, input: unknown): T {
  let nodes = 0;
  let bytes = 0;
  function visit(value: unknown, depth: number): void {
    if (++nodes > 2000 || depth > 8)
      throw new DataAccessError(
        'Data input exceeds the supported structure size',
      );
    if (typeof value === 'string') bytes += Buffer.byteLength(value, 'utf8');
    else if (Array.isArray(value)) {
      if (value.length > 100)
        throw new DataAccessError('Data input array is too large');
      for (const item of value) visit(item, depth + 1);
    } else if (value !== null && typeof value === 'object') {
      if (
        Object.getPrototypeOf(value) !== Object.prototype &&
        Object.getPrototypeOf(value) !== null
      )
        throw new DataAccessError('Data input must be plain JSON');
      const entries = Object.entries(value);
      if (entries.length > 100)
        throw new DataAccessError('Data input object is too large');
      for (const [key, item] of entries) {
        bytes += Buffer.byteLength(key, 'utf8');
        visit(item, depth + 1);
      }
    } else bytes += 16;
    if (bytes > 65536) throw new DataAccessError('Data input exceeds 64 KiB');
  }
  visit(input, 0);
  return schema.parse(input);
}

import { z } from 'zod';

import type {
  ManagedToolInputSchema,
  ManagedToolSchemaValue,
} from '../types.js';

/** Return display metadata only; never serialize schema instances or callbacks. */
export function serializeToolInputSchema(
  schema: unknown,
): ManagedToolInputSchema | null {
  try {
    const candidate: unknown =
      schema instanceof z.ZodType
        ? z.toJSONSchema(schema, { io: 'input' })
        : schema;
    if (!isPlainObject(candidate)) return null;
    const value = copyJSONValue(candidate, new Set(), 0);
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? value
      : null;
  } catch {
    // Unsupported schemas must not prevent inspecting the registered tool.
    return null;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function copyJSONValue(
  value: unknown,
  ancestors: Set<object>,
  depth: number,
): ManagedToolSchemaValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (depth > 100 || (!Array.isArray(value) && !isPlainObject(value))) {
    throw new Error('Unsupported tool schema value');
  }
  if (ancestors.has(value)) throw new Error('Circular tool schema');
  ancestors.add(value);
  try {
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const entries: Array<[string, ManagedToolSchemaValue]> = [];
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (!descriptor.enumerable) continue;
      if (!('value' in descriptor)) throw new Error('Tool schema accessor');
      entries.push([
        key,
        copyJSONValue(descriptor.value, ancestors, depth + 1),
      ]);
    }
    if (Array.isArray(value)) {
      if (
        entries.length !== value.length ||
        entries.some(([key], index) => key !== String(index))
      ) {
        throw new Error('Unsupported tool schema array');
      }
      return entries.map(([, item]) => item);
    }
    return Object.fromEntries(entries);
  } finally {
    ancestors.delete(value);
  }
}

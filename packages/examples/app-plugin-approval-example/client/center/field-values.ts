import type { JsonObject, JsonValue } from '@nocobase/lifecycle';

import type { FieldSpec } from './fields.js';

export function getPath(values: JsonObject, path: string): JsonValue {
  let current: JsonValue = values;
  for (const part of path.split('.')) {
    if (
      current === null ||
      typeof current !== 'object' ||
      Array.isArray(current)
    )
      return null;
    current = current[part] ?? null;
  }
  return current;
}

export function setPath(
  values: JsonObject,
  path: string,
  value: JsonValue,
): JsonObject {
  const [head, ...rest] = path.split('.');
  if (!rest.length) return { ...values, [head]: value };
  const child = values[head];
  return {
    ...values,
    [head]: setPath(
      child !== null && typeof child === 'object' && !Array.isArray(child)
        ? child
        : {},
      rest.join('.'),
      value,
    ),
  };
}

/** The fields required but left empty, by path. */
export function missingFields(
  specs: readonly FieldSpec[],
  values: JsonObject,
): string[] {
  return specs
    .filter((spec) => {
      if (!spec.required) return false;
      const value = getPath(values, spec.name);
      if (spec.kind === 'items') return !Array.isArray(value) || !value.length;
      if (spec.kind === 'people') return !Array.isArray(value) || !value.length;
      if (typeof value === 'number')
        return !Number.isFinite(value) || value <= 0;
      return value === null || (typeof value === 'string' && !value.trim());
    })
    .map((spec) => spec.name);
}

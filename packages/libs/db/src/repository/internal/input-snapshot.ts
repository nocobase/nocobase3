/** Copy input data at consumption time; callbacks keep their own closure semantics. */
export function snapshotQueryInput<T>(input: T): T {
  return copy(input, new WeakMap()) as T;
}

function copy(value: unknown, seen: WeakMap<object, unknown>): unknown {
  if (!value || typeof value !== 'object') return value;
  if (seen.has(value)) return seen.get(value);
  if (value instanceof Date) return new Date(value);
  if (Buffer.isBuffer(value)) return Buffer.from(value);
  if (Array.isArray(value)) {
    const result: unknown[] = [];
    seen.set(value, result);
    for (const item of value) result.push(copy(item, seen));
    return result;
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return value;
  const result: Record<string, unknown> = Object.create(prototype) as Record<
    string,
    unknown
  >;
  seen.set(value, result);
  for (const key of Object.getOwnPropertyNames(value)) {
    Object.defineProperty(result, key, {
      value: copy((value as Record<string, unknown>)[key], seen),
      enumerable: Object.prototype.propertyIsEnumerable.call(value, key),
      writable: true,
      configurable: true,
    });
  }
  return result;
}

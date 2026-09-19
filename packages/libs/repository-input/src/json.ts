/** The values that can be sent in a Repository JSON request. */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

/** Dates and bigint values use the same wire representation as Repository responses. */
export type JsonValueOf<T> = T extends (...args: never[]) => unknown
  ? never
  : T extends Date | bigint
    ? string
    : T extends readonly unknown[]
      ? { readonly [K in keyof T]: JsonValueOf<T[K]> }
      : T extends object
        ? { readonly [K in keyof T]: JsonValueOf<T[K]> }
        : unknown extends T
          ? JsonValue
          : T;

export function inputError(
  path: readonly (string | number)[],
  message: string,
): never {
  throw new TypeError(`${path.length ? path.join('.') : 'input'}: ${message}`);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/** Does not call arbitrary toJSON methods or silently drop functions. */
export function snapshotJson<T>(value: T): T {
  const ancestors = new Set<object>();
  const copy = (
    input: unknown,
    path: readonly (string | number)[],
  ): unknown => {
    if (
      input === undefined ||
      input === null ||
      typeof input === 'string' ||
      typeof input === 'boolean'
    )
      return input;
    if (typeof input === 'number') {
      if (!Number.isFinite(input))
        inputError(path, 'Expected a finite number.');
      return input;
    }
    if (typeof input === 'bigint') return input.toString();
    if (input instanceof Date) {
      if (!Number.isFinite(input.getTime()))
        inputError(path, 'Expected a valid Date.');
      return input.toISOString();
    }
    if (typeof input !== 'object')
      inputError(
        path,
        'Expected JSON data; callbacks must return synchronous builder results.',
      );
    if (ancestors.has(input)) inputError(path, 'Circular Repository input.');
    ancestors.add(input);
    try {
      if (Array.isArray(input))
        return Array.from(
          input,
          (item: unknown, i) => copy(item, [...path, i]) ?? null,
        );
      if (!isRecord(input)) inputError(path, 'Expected a plain JSON object.');
      return Object.fromEntries(
        Object.entries(input)
          .filter(([, item]) => item !== undefined)
          .map(([key, item]) => [key, copy(item, [...path, key])]),
      );
    } finally {
      ancestors.delete(input);
    }
  };
  return copy(value, []) as T;
}

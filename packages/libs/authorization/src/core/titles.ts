export type AuthorizationTitle =
  string | { readonly key: string; readonly ns: string };
export function parseAuthorizationTitle(
  value: unknown,
): AuthorizationTitle | undefined {
  if (value == null) return undefined;
  if (typeof value === 'string') return value;
  if (
    typeof value === 'object' &&
    !Array.isArray(value) &&
    'key' in value &&
    'ns' in value &&
    typeof value.key === 'string' &&
    value.key.trim() &&
    typeof value.ns === 'string' &&
    value.ns.trim()
  )
    return { key: value.key, ns: value.ns };
  throw new TypeError(
    'Title must be a string or a translation descriptor with key and ns',
  );
}
export function encodeAuthorizationTitle(
  value: AuthorizationTitle | undefined,
): string | null {
  return value === undefined ? null : JSON.stringify(value);
}
export function decodeAuthorizationTitle(
  value: unknown,
): AuthorizationTitle | undefined {
  return parseAuthorizationTitle(
    typeof value === 'string' ? JSON.parse(value) : value,
  );
}

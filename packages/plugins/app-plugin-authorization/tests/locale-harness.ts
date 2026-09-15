import enUS from '../client/locales/en-US.js';

/**
 * The English catalogue, read the way the runtime reads it, so a test asserts
 * on the shipped wording rather than on a literal copied beside it.
 */
export function translate(
  key: string,
  options?: Readonly<Record<string, unknown>>,
): string {
  const value = key
    .split('.')
    .reduce<unknown>(
      (node, part) =>
        typeof node === 'object' && node !== null
          ? Reflect.get(node, part)
          : undefined,
      enUS,
    );
  if (typeof value !== 'string')
    return typeof options?.defaultValue === 'string'
      ? options.defaultValue
      : key;
  return value.replace(/\{\{(\w+)\}\}/g, (_match, name: string) =>
    String(options?.[name] ?? ''),
  );
}

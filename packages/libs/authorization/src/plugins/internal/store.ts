/**
 * TypeScript already requires the store; this catches the JavaScript caller
 * that omits it, where the failure would otherwise surface at the first read.
 */
export function requireStore<TStore>(
  store: TStore | undefined,
  plugin: string,
): TStore {
  if (!store) throw new TypeError(`${plugin} requires a store`);
  return store;
}

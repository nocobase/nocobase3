import type { ConfigProvider, ConfigProviderResult } from '../types.js';

export function rawBytesProvider(
  value: Uint8Array,
  name: string = 'raw-bytes',
): ConfigProvider {
  const bytes = Uint8Array.from(value);
  return {
    name,
    read: async (): Promise<ConfigProviderResult> => ({
      kind: 'bytes',
      value: Uint8Array.from(bytes),
    }),
  };
}

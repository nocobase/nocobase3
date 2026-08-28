import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import type { ConfigProvider, ConfigProviderResult } from '../types.js';

export interface FileProviderOptions {
  readonly name?: string;
}

export function fileProvider(
  filePath: string,
  options: FileProviderOptions = {},
): ConfigProvider {
  const normalizedPath = path.resolve(filePath);

  return {
    name: options.name ?? `file:${normalizedPath}`,
    async read(context): Promise<ConfigProviderResult> {
      const [value, attributes] = await Promise.all([
        readFile(normalizedPath, { signal: context.signal }),
        stat(normalizedPath),
      ]);
      return {
        kind: 'bytes',
        value,
        metadata: {
          lastModified: attributes.mtime,
          etag: `${attributes.size}-${attributes.mtimeMs}`,
        },
      };
    },
  };
}

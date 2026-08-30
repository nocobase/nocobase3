import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import type { ConfigProvider, ConfigProviderResult } from '../types.js';

export interface FileProviderOptions {
  readonly name?: string;
  readonly optional?: boolean;
}

export function fileProvider(
  filePath: string,
  options: FileProviderOptions = {},
): ConfigProvider {
  const normalizedPath = path.resolve(filePath);

  return {
    name: options.name ?? `file:${normalizedPath}`,
    async read(context): Promise<ConfigProviderResult> {
      let value: Uint8Array;
      let attributes;
      try {
        [value, attributes] = await Promise.all([
          readFile(normalizedPath, { signal: context.signal }),
          stat(normalizedPath),
        ]);
      } catch (error) {
        if (options.optional && isMissingFileError(error)) {
          return {
            kind: 'bytes',
            value: new TextEncoder().encode('{}'),
          };
        }
        throw error;
      }
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

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

import { appendFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import type { AuditWriter } from '../types.js';

/** Resolves after appendFile, not fsync. The caller prepares the directory. */
export function createJsonlAuditWriter(filePath: string): AuditWriter {
  if (!isAbsolute(filePath))
    throw new Error('Audit file path must be absolute.');
  let pending: Promise<void> = Promise.resolve();
  return {
    write(event): Promise<void> {
      const line = `${JSON.stringify(event)}\n`;
      const write = pending.then(() =>
        appendFile(filePath, line, { encoding: 'utf8', mode: 0o600 }),
      );
      pending = write.catch(() => undefined);
      return write;
    },
  };
}

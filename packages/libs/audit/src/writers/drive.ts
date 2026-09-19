import type { AuditWriter } from '../types.js';

/** Structural subset of a configured @nocobase/drive disk. */
export interface AuditDriveDisk {
  put(
    key: string,
    contents: string,
    options: { visibility: 'private'; contentType: string },
  ): Promise<void>;
}

export interface DriveAuditWriterOptions {
  disk: AuditDriveDisk;
  /** Relative object prefix, composed of non-empty safe path segments. */
  prefix?: string;
}

/** Writes one JSONL object per event; resolves after the disk acknowledges put. */
export function createDriveAuditWriter({
  disk,
  prefix = 'audit',
}: DriveAuditWriterOptions): AuditWriter {
  if (!prefix.split('/').every((segment) => /^[a-zA-Z0-9_-]+$/.test(segment))) {
    throw new Error('Audit object prefix must contain safe relative segments.');
  }
  return {
    async write(event): Promise<void> {
      const app = Buffer.from(event.appName, 'utf8').toString('base64url');
      const date = event.occurredAt.slice(0, 10).replaceAll('-', '/');
      const key = `${prefix}/${app}/${date}/${event.id}.jsonl`;
      await disk.put(key, `${JSON.stringify(event)}\n`, {
        visibility: 'private',
        contentType: 'application/x-ndjson',
      });
    },
  };
}

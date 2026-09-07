import type { Context, MiddlewareHandler } from 'hono';
import type {
  CreateFileRouteOptions,
  FileAuditTarget,
  FileRecord,
} from './types.js';

interface Capture {
  readonly id?: string;
  readonly record?: Pick<FileRecord, 'id' | 'size' | 'mimeType' | 'disk'>;
  readonly phase: string;
}

export interface FileRouteAudit {
  http(action: string): MiddlewareHandler;
  identify(context: Context, id: string): void;
  remember(context: Context, record: FileRecord): void;
  stage(
    context: Context,
    phase: string,
    record?: FileRecord,
    failed?: boolean,
  ): Promise<void>;
}

/** One request-local snapshot, containing no URL, storage key, filename or content. */
export function createFileAudit(
  options: CreateFileRouteOptions,
): FileRouteAudit {
  const captures = new WeakMap<Context, Capture>();
  const remember = (
    context: Context,
    record: FileRecord,
    phase: string,
  ): void => {
    captures.set(context, {
      id: record.id,
      phase,
      record: {
        id: record.id,
        size: record.size,
        mimeType: record.mimeType,
        disk: record.disk,
      },
    });
  };
  const target = (context: Context): FileAuditTarget => ({
    ...(options.database
      ? { dataSource: options.database.connection().name }
      : {}),
    resource: options.table ?? options.audience,
    ...(captures.get(context)?.id ? { key: captures.get(context)?.id } : {}),
  });
  const details = (context: Context): Readonly<Record<string, unknown>> => {
    const capture = captures.get(context);
    return {
      phase: capture?.phase ?? 'request',
      ...(capture?.record
        ? {
            size: capture.record.size,
            mimeType: capture.record.mimeType,
            storage: capture.record.disk,
          }
        : {}),
    };
  };
  return {
    identify: (context, id) => captures.set(context, { id, phase: 'request' }),
    remember: (context, record) => remember(context, record, 'request'),
    http: (action) =>
      options.audit?.http({ action, target, details }) ??
      (async (_context, next) => {
        await next();
      }),
    stage: async (context, phase, record, failed = false) => {
      if (record) remember(context, record, phase);
      else captures.set(context, { phase });
      if (!options.audit) return;
      if (failed)
        options.audit.markHttpResult(context, {
          outcome: 'failed',
          reasonCode: 'FILE_STORAGE_CLEANUP_FAILED',
        });
      try {
        await options.audit.record({
          action: `file.${phase}`,
          outcome: failed ? 'failed' : 'success',
          target: target(context),
          ...(options.auditSource
            ? { source: options.auditSource(context) }
            : {}),
          details: details(context),
        });
      } catch {
        // Observations cannot undo a completed file operation or trigger its replay.
        console.error('File audit observation failed.', {
          code: 'FILE_AUDIT_WRITE_FAILED',
        });
      }
    },
  };
}

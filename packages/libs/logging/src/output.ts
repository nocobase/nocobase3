import { Writable } from 'node:stream';
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import {
  appendJournal,
  pruneJournals,
  sanitizeLog,
  validateJournalPolicy,
  type JournalEntry,
  type JournalPolicy,
} from './journal.js';

export interface FileLogOptions extends JournalPolicy {
  directory?: string;
  name?: string;
  maxFileSizeMB?: number;
  maxTotalSizeMB?: number;
}
export interface LoggerFileOptions {
  enabled?: boolean;
  name?: string;
}
export interface ConsoleLogOptions {
  enabled?: boolean;
  pretty?: boolean;
}
export interface LogOutputOptions {
  file?: FileLogOptions;
  console?: ConsoleLogOptions;
}
const reported = new Set<string>();
/** Logging failures must not recursively log or change application results. */
export function reportLoggingFailure(message: string, error?: unknown): void {
  if (reported.has(message)) return;
  reported.add(message);
  try {
    process.stderr.write(
      `${message}${error === undefined ? '' : `: ${JSON.stringify(sanitizeLog(error))}`}\n`,
    );
  } catch {
    // No further output is possible when stderr itself is unavailable.
  }
}
export function normalizeFileOptions(
  file: FileLogOptions = {},
): FileLogOptions {
  if (file.maxSizeMB !== undefined)
    reportLoggingFailure(
      'logging.file.maxSizeMB is deprecated; use maxTotalSizeMB',
    );
  const normalized = {
    ...file,
    name: file.name ?? 'app',
    maxTotalSizeMB: file.maxSizeMB ?? file.maxTotalSizeMB ?? 500,
    maxFileSizeMB:
      file.maxFileSizeMB ??
      Math.min(10, (file.maxSizeMB ?? file.maxTotalSizeMB ?? 500) / 2),
    retentionDays: file.retentionDays ?? 7,
  };
  validateJournalPolicy({
    retentionDays: normalized.retentionDays,
    maxSizeMB: normalized.maxTotalSizeMB,
  });
  validateJournalPolicy({ maxSizeMB: normalized.maxFileSizeMB });
  if (!/^[a-zA-Z0-9_-]+$/.test(normalized.name))
    throw new Error('Invalid log file name');
  if (normalized.maxFileSizeMB > normalized.maxTotalSizeMB)
    throw new Error(
      'logging.file.maxFileSizeMB must not exceed maxTotalSizeMB',
    );
  return normalized;
}
function prettyEntry(entry: JournalEntry): string {
  const {
    time,
    level,
    logger,
    msg,
    err,
    pid: _pid,
    hostname: _hostname,
    service: _service,
    appId,
    runtimeId: _runtimeId,
    deploymentId: _deploymentId,
    durationMs,
    ...fields
  } = entry;
  const names: Record<number, string> = {
    10: 'TRACE',
    20: 'DEBUG',
    30: 'INFO',
    40: 'WARN',
    50: 'ERROR',
    60: 'FATAL',
  };
  const label =
    typeof level === 'number'
      ? (names[level] ?? String(level))
      : level.toUpperCase();
  const name = typeof logger === 'string' ? logger : 'system';
  const scope = typeof appId === 'string' ? `${appId}/${name}` : name;
  if (fields.app === appId) delete fields.app;
  // The completion message already contains the method, path and status.
  // Keep failure and debug context, and retain every field in the journal.
  if (name === 'request' && label === 'INFO') {
    delete fields.req;
    delete fields.res;
    delete fields.requestId;
  }
  const details = Object.entries(fields)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
    .join(' ');
  const date = new Date(time);
  const clock = Number.isNaN(date.getTime())
    ? time
    : `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}.${String(date.getMilliseconds()).padStart(3, '0')}`;
  return `${clock} ${label} [${scope}] ${msg}${typeof durationMs === 'number' ? ` ${durationMs}ms` : ''}${details ? ` ${details}` : ''}${err ? `\n${JSON.stringify(err, null, 2)}` : ''}\n`;
}
interface DirectoryWriter {
  references: number;
  cleanup: Promise<void>;
  lastCleanup: number;
  lastFile?: string;
  files: Map<string, { date: string; part: number }>;
}
const directories = new Map<string, DirectoryWriter>();
/** Shared across named loggers and hosted lifecycle writers in the same process. */
export function createLogOutput(options: LogOutputOptions): Writable {
  const file = normalizeFileOptions(options.file);
  const directory =
    file.enabled !== false && file.directory
      ? path.resolve(file.directory)
      : undefined;
  let manager: DirectoryWriter | undefined;
  if (directory) {
    manager = directories.get(directory) ?? {
      references: 0,
      cleanup: Promise.resolve(),
      lastCleanup: 0,
      files: new Map(),
    };
    manager.references++;
    directories.set(directory, manager);
  }
  let filename = '';
  let part = 0;
  let date = '';
  return new Writable({
    write(chunk: Buffer, _encoding, done) {
      try {
        const entry = sanitizeLog(
          JSON.parse(chunk.toString('utf8')),
        ) as JournalEntry;
        if (directory && manager) {
          try {
            const today = new Date().toISOString().slice(0, 10);
            const shared = manager.files.get(file.name!);
            if (shared) {
              date = shared.date;
              part = shared.part;
            }
            if (date !== today) {
              date = today;
              part = 0;
              // Resume the newest segment after restart; older segments may be intentionally under the size limit.
              try {
                const prefix = `${file.name}.${date}.`;
                for (const existing of readdirSync(directory)) {
                  if (
                    existing.startsWith(prefix) &&
                    existing.endsWith('.log')
                  ) {
                    const suffix = existing.slice(prefix.length, -4);
                    if (/^\d+$/.test(suffix))
                      part = Math.max(part, Number(suffix));
                  }
                }
              } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
                  throw error;
              }
              filename = '';
            }
            let rotated = !filename;
            filename = path.join(
              directory,
              `${file.name}.${date}.${String(part).padStart(6, '0')}.log`,
            );
            for (;;) {
              try {
                if (statSync(filename).size < file.maxFileSizeMB! * 1024 * 1024)
                  break;
              } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
                  throw error;
                break;
              }
              filename = path.join(
                directory,
                `${file.name}.${date}.${String(++part).padStart(6, '0')}.log`,
              );
              rotated = true;
            }
            // Rotate before a complete record would overflow; never discard the boundary record.
            const bytes = Buffer.byteLength(JSON.stringify(entry)) + 1;
            let size = 0;
            try {
              size = statSync(filename).size;
            } catch (error) {
              if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
                throw error;
            }
            if (size && size + bytes > file.maxFileSizeMB! * 1024 * 1024) {
              filename = path.join(
                directory,
                `${file.name}.${date}.${String(++part).padStart(6, '0')}.log`,
              );
              rotated = true;
            }
            manager.files.set(file.name!, { date, part });
            manager.lastFile = path.basename(filename);
            appendJournal(
              filename,
              entry,
              Math.max(file.maxFileSizeMB!, bytes / 1024 / 1024 + 0.001),
            );
            if (rotated || Date.now() - manager.lastCleanup > 60000) {
              manager.lastCleanup = Date.now();
              const owner = manager;
              manager.cleanup = manager.cleanup
                .then(() =>
                  pruneJournals(
                    directory,
                    {
                      retentionDays: file.retentionDays,
                      maxSizeMB: file.maxTotalSizeMB,
                    },
                    owner.lastFile,
                  ),
                )
                .catch((error: unknown) =>
                  reportLoggingFailure('Log cleanup failed', error),
                );
            }
          } catch (error) {
            reportLoggingFailure('Log file output failed', error);
          }
        }
        if (options.console?.enabled) {
          process.stdout.write(
            options.console.pretty
              ? prettyEntry(entry)
              : JSON.stringify(entry) + '\n',
          );
        }
      } catch (error) {
        reportLoggingFailure('Log output failed', error);
      }
      done();
    },
    final(done) {
      const pending = manager?.cleanup ?? Promise.resolve();
      void pending.finally(() => {
        if (manager && --manager.references === 0 && directory)
          directories.delete(directory);
        done();
      });
    },
  });
}

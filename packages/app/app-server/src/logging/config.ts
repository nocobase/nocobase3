import { reportLoggingFailure } from '@nocobase/logging';
import type {
  LoggingConfig,
  FileLogOptions,
  ConsoleLogOptions,
} from '@nocobase/logging';

export interface AppLoggingConfig extends LoggingConfig {
  readonly pretty?: boolean;
}

export interface AppRuntimeLogging {
  readonly file?: FileLogOptions;
  readonly enabled?: boolean;
  readonly level?: string;
  readonly retentionDays?: number;
  readonly maxSizeMB?: number;
  readonly console?: boolean | ConsoleLogOptions;
  readonly bindings?: Readonly<Record<string, string>>;
}

/** Normalize legacy Host policy fields once at the App/Host boundary. */
export function normalizeRuntimeLogging(
  policy: AppRuntimeLogging = {},
): AppRuntimeLogging {
  if (
    policy.enabled !== undefined ||
    policy.retentionDays !== undefined ||
    policy.maxSizeMB !== undefined
  ) {
    reportLoggingFailure(
      'Legacy runtime logging fields are deprecated; move enabled, retentionDays and maxSizeMB to file.enabled, file.retentionDays and file.maxTotalSizeMB',
    );
  }
  return {
    ...policy,
    file: {
      ...policy.file,
      ...(policy.enabled === undefined ? {} : { enabled: policy.enabled }),
      ...(policy.retentionDays === undefined
        ? {}
        : { retentionDays: policy.retentionDays }),
      ...(policy.maxSizeMB === undefined
        ? {}
        : { maxTotalSizeMB: policy.maxSizeMB }),
    },
    console:
      typeof policy.console === 'boolean'
        ? { enabled: policy.console }
        : policy.console,
  };
}

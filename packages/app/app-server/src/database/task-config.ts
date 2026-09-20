import { ConfigView, type ConfigMap } from '@nocobase/config';
import type { DatabaseTaskConfig } from '@nocobase/db';

/** Capture ordinary configuration values once, using the application's path semantics. */
export function snapshotDatabaseTaskConfig(
  config?: DatabaseTaskConfig & { raw?(): ConfigMap },
): DatabaseTaskConfig {
  // A get-only reader has no enumeration contract: preserve its lookup semantics.
  if (config && !config.raw) {
    return Object.freeze({
      get<T = unknown>(key: string): T | undefined {
        return config.get<T>(key);
      },
    });
  }
  const snapshot = new ConfigView(config?.raw?.() ?? {}, '.');
  return Object.freeze({
    get<T = unknown>(key: string): T | undefined {
      return snapshot.get(key) as T | undefined;
    },
  });
}

import { ConfigView, type ConfigMap } from '@nocobase/config';
import type { DatabaseTaskConfig } from '@nocobase/db';

/** Capture ordinary configuration values once, using the application's path semantics. */
export function snapshotDatabaseTaskConfig(
  config?: DatabaseTaskConfig,
): DatabaseTaskConfig {
  const snapshot = new ConfigView(config?.get<ConfigMap>('') ?? {}, '.');
  return Object.freeze({
    get<T = unknown>(key: string): T | undefined {
      return snapshot.get(key) as T | undefined;
    },
  });
}

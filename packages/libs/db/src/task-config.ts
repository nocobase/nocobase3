/** Read-only runtime configuration supplied by the task owner. */
export interface DatabaseTaskConfig {
  get<T = unknown>(key: string): T | undefined;
}

/** Standalone runners remain usable without application configuration. */
export const emptyDatabaseTaskConfig: DatabaseTaskConfig = Object.freeze({
  get: () => undefined,
});

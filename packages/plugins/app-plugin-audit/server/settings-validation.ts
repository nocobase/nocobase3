import { types } from 'node:util';
import type { AuditSettings, AuditSettingsUpdate } from './contracts.js';
import { AuditError } from './errors.js';

function plain(value: unknown): Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    types.isProxy(value) ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    Reflect.ownKeys(value).some(
      (key) =>
        typeof key !== 'string' ||
        !('value' in (Object.getOwnPropertyDescriptor(value, key) ?? {})),
    )
  )
    throw new AuditError('AUDIT_POLICY_CONFLICT');
  return value as Record<string, unknown>;
}
function identifier(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > 256 ||
    [...value].some((char) => char.charCodeAt(0) < 32)
  )
    throw new AuditError('AUDIT_POLICY_CONFLICT');
  return value;
}
function keys(
  value: Record<string, unknown>,
  allowed: readonly string[],
): void {
  if (Object.keys(value).some((key) => !allowed.includes(key)))
    throw new AuditError('AUDIT_POLICY_CONFLICT');
}
/** Validate before copying or serialization; deployment overrides are not settings. */
export function snapshotAuditSettings(input: unknown): AuditSettings {
  const value = plain(input);
  keys(value, [
    'revision',
    'enabled',
    'observationStore',
    'sources',
    'retentionDays',
    'maxDetailsBytes',
  ]);
  const sources = plain(value.sources);
  keys(sources, ['http', 'runtime', 'database']);
  const targets = sources.database;
  if (
    !Number.isSafeInteger(value.revision) ||
    Number(value.revision) < 1 ||
    Number(value.revision) > 2147483647 ||
    typeof value.enabled !== 'boolean' ||
    (value.retentionDays !== null &&
      (!Number.isSafeInteger(value.retentionDays) ||
        Number(value.retentionDays) < 1 ||
        Number(value.retentionDays) > 365000)) ||
    !Number.isSafeInteger(value.maxDetailsBytes) ||
    Number(value.maxDetailsBytes) < 1 ||
    Number(value.maxDetailsBytes) > 1048576 ||
    (sources.http !== 'disabled' && sources.http !== 'declared-routes') ||
    (sources.runtime !== 'disabled' &&
      sources.runtime !== 'integrated-producers') ||
    !Array.isArray(targets) ||
    types.isProxy(targets) ||
    targets.length > 256 ||
    Object.getPrototypeOf(targets) !== Array.prototype ||
    Reflect.ownKeys(targets).some((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(targets, key);
      return (
        typeof key !== 'string' ||
        !descriptor ||
        !('value' in descriptor) ||
        (key !== 'length' && !/^(0|[1-9][0-9]*)$/.test(key))
      );
    }) ||
    Array.from({ length: targets.length }, (_, index) => index).some(
      (index) => !Object.hasOwn(targets, index),
    )
  )
    throw new AuditError('AUDIT_POLICY_CONFLICT');
  const database = targets.map((target: unknown) => {
    const item = plain(target);
    keys(item, ['dataSource', 'table', 'schema']);
    return Object.freeze({
      dataSource: identifier(item.dataSource),
      table: identifier(item.table),
      ...(item.schema === undefined ? {} : { schema: identifier(item.schema) }),
    });
  });
  if (
    new Set(
      database.map((target) =>
        JSON.stringify([target.dataSource, target.schema, target.table]),
      ),
    ).size !== database.length
  )
    throw new AuditError('AUDIT_POLICY_CONFLICT');
  return Object.freeze({
    revision: Number(value.revision),
    enabled: value.enabled,
    observationStore: identifier(value.observationStore),
    sources: Object.freeze({
      http: sources.http,
      runtime: sources.runtime,
      database: Object.freeze(database),
    }),
    retentionDays:
      value.retentionDays === null ? null : Number(value.retentionDays),
    maxDetailsBytes: Number(value.maxDetailsBytes),
  });
}

/** Inspect the transport object before spreading any user-supplied property. */
export function snapshotAuditSettingsUpdate(
  input: unknown,
): AuditSettingsUpdate {
  const value = plain(input);
  keys(value, ['expectedRevision', 'settings', 'confirmRetentionReduction']);
  if (
    !Number.isSafeInteger(value.expectedRevision) ||
    Number(value.expectedRevision) < 1 ||
    typeof value.confirmRetentionReduction !== 'boolean'
  )
    throw new AuditError('AUDIT_POLICY_CONFLICT');
  const settings = plain(value.settings);
  const next = snapshotAuditSettings({
    ...settings,
    revision: Number(value.expectedRevision) + 1,
  });
  return Object.freeze({
    expectedRevision: Number(value.expectedRevision),
    settings: next,
    confirmRetentionReduction: value.confirmRetentionReduction,
  });
}

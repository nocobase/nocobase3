import {
  AuditDatabaseCollector,
  type AuditDatabaseCollectorOptions,
} from '../database-collector.js';

/** Explicit App-owned resource, installed after migrations and before readiness.start/traffic. */
export async function createAuditDatabaseCollector(
  options: AuditDatabaseCollectorOptions,
): Promise<AuditDatabaseCollector> {
  const collector = new AuditDatabaseCollector(options);
  await collector.start();
  return collector;
}

import { transactionAuthority, type DatabaseConnection } from '@nocobase/db';
import { AuditError } from './errors.js';
import type { PortableAuditStore } from './store.js';

/** The existing transaction authority proves manager/physical-connection identity, not its display name. */
export async function assertAuditStoreConnection(
  connection: DatabaseConnection,
  store: PortableAuditStore,
): Promise<void> {
  await connection.transaction((active) => {
    const handle = transactionAuthority.current(active);
    if (!handle) throw new AuditError('AUDIT_NOT_READY');
    store.validateTransaction(handle);
    return Promise.resolve();
  });
}

import { bindAuditRecorder } from '@nocobase/app-plugin-audit/server';
import type { AuditRecorderPolicy } from '../../server/service.js';
import {
  createPortableFixture,
  type PortableFixture,
} from '../helpers/database-fixtures.js';

export interface RawClient {
  raw(sql: string, bindings?: readonly unknown[]): Promise<unknown>;
}
export interface Fixture extends PortableFixture {
  policy: AuditRecorderPolicy;
}
export async function createFixture(migrate: boolean = true): Promise<Fixture> {
  // Attach metadata before opening the connection, as required by the SQLite fixtures.
  const base = await createPortableFixture(
    'sqlite',
    migrate,
    'main',
    'connection',
  );
  const fixture: Fixture = {
    ...base,
    policy: { revision: 7, enabled: true, maxDetailsBytes: 65536 },
    recorder: bindAuditRecorder(base.scope, {
      producer: 'synthetic-runtime',
      store: base.store,
      policy: () => Promise.resolve(fixture.policy),
    }),
  };
  return fixture;
}

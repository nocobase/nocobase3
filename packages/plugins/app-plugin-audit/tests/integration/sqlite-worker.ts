import { createDatabaseManager } from '@nocobase/db';
import {
  PortableAuditStore,
  bindAuditRecorder,
} from '@nocobase/app-plugin-audit/server';
const filename = process.argv[2];
const manager = createDatabaseManager({
  connections: { main: { dialect: 'sqlite', filename } },
});
try {
  const scope = {
    appId: 'synthetic-app',
    actor: { type: 'user', id: 'synthetic-user' },
  };
  const store = new PortableAuditStore(manager.connection(), {
    appId: scope.appId,
    store: 'main',
  });
  await store.prepare();
  const recorder = bindAuditRecorder(scope, {
    store,
    producer: 'synthetic-runtime',
    policy: () =>
      Promise.resolve({ revision: 7, enabled: true, maxDetailsBytes: 65536 }),
  });
  process.stdout.write('READY\n');
  await new Promise<void>((resolve) =>
    process.stdin.once('data', () => resolve()),
  );
  const receipt = await recorder.record(
    { action: 'synthetic.created', outcome: 'success' },
    { idempotencyKey: 'cross-process' },
  );
  process.stdout.write(JSON.stringify(receipt) + '\n');
} finally {
  await manager.destroy();
  process.stdin.destroy();
}

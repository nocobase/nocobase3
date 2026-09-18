import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

it('loads official peers in native ESM without splitting identities or opening unused connections', () => {
  const require = createRequire(import.meta.url);
  const output = execFileSync(
    process.execPath,
    [
      '--import',
      require.resolve('tsx/esm'),
      '--input-type=module',
      '-e',
      `
      import assert from 'node:assert/strict';
      import { createRequire } from 'node:module';
      import { createDatabaseManager, resolveDatabaseDriver } from './src/index.ts';
      const require = createRequire(import.meta.url);
      const dialects = ['sqlite', 'mysql', 'postgres', 'mssql', 'oracle', 'dameng', 'kingbase', 'oceanbase'];
      const db = createDatabaseManager({ connections: {
        main: { dialect: 'sqlite', filename: ':memory:' },
        unused: { dialect: 'unknown' },
      }});
      for (const dialect of dialects) {
        assert.equal(require.cache[require.resolve('@nocobase/db-' + dialect)], undefined);
      }
      const main = db.connection();
      assert.equal(main, db.connection());
      for (const dialect of dialects.filter(d => d !== 'sqlite')) {
        assert.equal(require.cache[require.resolve('@nocobase/db-' + dialect)], undefined);
      }
      const client = await main.client();
      await client.schema.createTable('items', table => table.increments('id'));
      await client('items').insert({});
      assert.equal((await main.query.selectFrom('items').selectAll().execute()).length, 1);
      await db.destroy();
      for (const dialect of dialects) {
        const loaded = resolveDatabaseDriver({ dialect });
        const imported = await import('@nocobase/db-' + dialect);
        assert.equal(loaded, imported.default.driver);
      }
      console.log('ok');
    `,
    ],
    {
      cwd: fileURLToPath(new URL('../../../', import.meta.url)),
      encoding: 'utf8',
      env: { ...process.env, NODE_OPTIONS: '' },
    },
  );
  expect(output.trim()).toBe('ok');
});

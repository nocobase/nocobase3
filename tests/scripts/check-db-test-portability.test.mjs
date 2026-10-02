import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  checkDbTestPortability,
  findViolations,
  readMarker,
} from '../../scripts/check-db-test-portability.mjs';

const rules = (source) =>
  findViolations(source).map((violation) => violation.rule);

test('finds each way a test chooses SQLite', () => {
  assert.deepEqual(rules("import sqlite from '@nocobase/db-sqlite';"), [
    'dialect-import',
  ]);
  assert.deepEqual(
    rules("const m = await import('@nocobase/db-postgres/testing');"),
    ['dialect-import'],
  );
  assert.deepEqual(rules("{ filename: ':memory:' }"), ['memory-database']);
  assert.deepEqual(rules("{ dialect: 'sqlite' }"), ['sqlite-dialect']);
  assert.deepEqual(rules("client.raw('PRAGMA index_list(jobs)')"), ['pragma']);
  assert.deepEqual(rules("client.raw('select name from sqlite_master')"), [
    'sqlite-catalog',
  ]);
  assert.deepEqual(
    rules(
      "client.raw('CREATE TRIGGER t BEFORE INSERT ON x BEGIN SELECT 1; END')",
    ),
    ['trigger'],
  );
});

test('leaves portable tests and look-alikes alone', () => {
  assert.deepEqual(
    rules("import { createDatabaseTest } from '@nocobase/db-testing/vitest';"),
    [],
  );
  assert.deepEqual(
    rules("expect(headers.get('pragma')).toBe('no-cache');"),
    [],
  );
  assert.deepEqual(rules("const spec = '@nocobase/db-postgres@^0.1.0';"), []);
});

test('reads a marker and requires a reason', () => {
  assert.deepEqual(
    readMarker('// db-test-portability: sqlite-only — the driver under test\n'),
    {
      kind: 'sqlite-only',
      reason: 'the driver under test',
    },
  );
  assert.deepEqual(
    readMarker(
      '// @vitest-environment node\n// db-test-portability: dialect-specific - each dialect\n',
    ),
    {
      kind: 'dialect-specific',
      reason: 'each dialect',
    },
  );
  assert.deepEqual(readMarker('// db-test-portability: sqlite-only\n'), {
    kind: 'sqlite-only',
    reason: undefined,
  });
  assert.equal(readMarker("import x from 'y';\n"), undefined);
});

test('reports unmarked tests and helpers but not marked ones or the database packages', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'db-test-portability-'));
  try {
    const write = (relativePath, source) => {
      const file = path.join(root, relativePath);
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, source);
    };
    write(
      'packages/plugins/a/tests/a.test.ts',
      "const c = { dialect: 'sqlite' };\n",
    );
    write(
      'packages/plugins/a/tests/support/database.ts',
      "const c = { filename: ':memory:' };\n",
    );
    write(
      'packages/plugins/a/server/index.ts',
      "const c = { dialect: 'sqlite' };\n",
    );
    write(
      'packages/plugins/b/tests/b.test.ts',
      "// db-test-portability: sqlite-only — the SQLite driver\nconst c = { dialect: 'sqlite' };\n",
    );
    write(
      'packages/plugins/c/tests/c.test.ts',
      "// db-test-portability: sqlite-only\nconst c = { dialect: 'sqlite' };\n",
    );
    write(
      'packages/libs/db-sqlite/tests/x.test.ts',
      "const c = { dialect: 'sqlite' };\n",
    );

    const problems = await checkDbTestPortability({ repositoryRoot: root });
    const files = problems.map((problem) => problem.file);

    assert.ok(files.includes('packages/plugins/a/tests/a.test.ts'));
    assert.ok(files.includes('packages/plugins/a/tests/support/database.ts'));
    assert.ok(!files.includes('packages/plugins/a/server/index.ts'));
    assert.ok(!files.includes('packages/plugins/b/tests/b.test.ts'));
    assert.ok(
      problems.some(
        (problem) =>
          problem.file === 'packages/plugins/c/tests/c.test.ts' &&
          /gives no reason/.test(problem.message),
      ),
    );
    assert.ok(!files.includes('packages/libs/db-sqlite/tests/x.test.ts'));
    // Listed files that do not exist in this synthetic repository are reported as stale entries.
    assert.ok(
      problems.some((problem) => /no longer exists/.test(problem.message)),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

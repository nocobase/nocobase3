import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  dbTestingPackages,
  parseTestDbArguments,
  testDbCommand,
  TestDbUsageError,
} from '../../scripts/test-db.mjs';

test('runs each filtered package test script with the remaining arguments', () => {
  const parsed = parseTestDbArguments([
    'postgres',
    '--filter',
    '@nocobase/app-plugin-scheduler',
    '--filter=@nocobase/db-testing',
    '--',
    'tests/database.test.ts',
  ]);
  assert.deepEqual(parsed, {
    dialect: 'postgres',
    all: false,
    filters: ['@nocobase/app-plugin-scheduler', '@nocobase/db-testing'],
    testArguments: ['tests/database.test.ts'],
  });
  assert.deepEqual(testDbCommand(parsed), {
    command: 'pnpm',
    args: [
      '--filter',
      '@nocobase/app-plugin-scheduler',
      '--filter',
      '@nocobase/db-testing',
      '--workspace-concurrency=1',
      '--no-bail',
      'run',
      'test',
      'tests/database.test.ts',
    ],
  });
});

test('accepts --all in place of filters', () => {
  assert.deepEqual(parseTestDbArguments(['mysql', '--all']), {
    dialect: 'mysql',
    all: true,
    filters: [],
    testArguments: [],
  });
});

test('refuses to run the whole workspace or a malformed request', () => {
  for (const argv of [
    [],
    ['--filter', 'x'],
    ['postgres'],
    ['Postgres;', '--filter', 'x'],
    ['postgres', '--filter'],
    ['postgres', '--filter', 'x', 'tests/a.test.ts'],
    ['postgres', '--all', '--filter', 'x'],
  ]) {
    assert.throws(
      () => parseTestDbArguments(argv),
      TestDbUsageError,
      argv.join(' '),
    );
  }
});

test('--all selects the packages that declare @nocobase/db-testing directly', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'test-db-'));
  try {
    const write = (directory, manifest) => {
      mkdirSync(path.join(root, 'packages', directory), { recursive: true });
      writeFileSync(
        path.join(root, 'packages', directory, 'package.json'),
        JSON.stringify(manifest),
      );
    };
    write('libs/db-testing', { name: '@nocobase/db-testing' });
    write('plugins/a', {
      name: '@nocobase/app-plugin-a',
      devDependencies: { '@nocobase/db-testing': 'workspace:*' },
    });
    write('plugins/b', {
      name: '@nocobase/app-plugin-b',
      dependencies: { '@nocobase/app-plugin-a': 'workspace:*' },
    });
    mkdirSync(path.join(root, 'packages/plugins/empty'));
    assert.deepEqual(dbTestingPackages(root), [
      '@nocobase/app-plugin-a',
      '@nocobase/db-testing',
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('--all finds the ported packages in this repository', () => {
  const names = dbTestingPackages();
  assert.ok(names.includes('@nocobase/db-testing'));
  assert.ok(names.includes('@nocobase/app-plugin-scheduler'));
  assert.equal(new Set(names).size, names.length);
});

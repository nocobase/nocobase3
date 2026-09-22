import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { countPublications } from '../../scripts/publish-plan-has-publications.mjs';

test('counts only real package publications', () => {
  assert.equal(
    countPublications({
      version: 1,
      plan: [
        [{ kind: 'tag-only', name: '@nocobase/a', version: '1.0.0' }],
        [
          { kind: 'publish', name: '@nocobase/b', version: '1.0.0' },
          { kind: 'publish', name: '@nocobase/c', version: '1.0.0' },
        ],
      ],
    }),
    2,
  );
});

test('returns zero for empty and tag-only retries', () => {
  assert.equal(countPublications({ version: 1, plan: [] }), 0);
  assert.equal(
    countPublications({
      version: 1,
      plan: [[{ kind: 'tag-only', name: '@nocobase/a', version: '1.0.0' }]],
    }),
    0,
  );
});

test('rejects malformed plans instead of treating them as no-op releases', () => {
  assert.throws(
    () => countPublications({ version: 1, plan: [{}] }),
    /group 0 must be an array/u,
  );
  assert.throws(
    () => countPublications({ version: 2, plan: [] }),
    /version 1/u,
  );
});

test('CLI distinguishes publications, no-op retries, and invalid plans', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'publish-plan-test-'));
  const script = path.resolve(
    import.meta.dirname,
    '../../scripts/publish-plan-has-publications.mjs',
  );
  const run = (name, document) => {
    const file = path.join(directory, name);
    writeFileSync(file, `${JSON.stringify(document)}\n`);
    return spawnSync(process.execPath, [script, file], { encoding: 'utf8' });
  };

  try {
    assert.equal(
      run('publish.json', {
        version: 1,
        plan: [[{ kind: 'publish', name: '@nocobase/a', version: '1.0.0' }]],
      }).status,
      0,
    );
    assert.equal(run('retry.json', { version: 1, plan: [] }).status, 1);
    assert.equal(run('invalid.json', { version: 2, plan: [] }).status, 2);
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});

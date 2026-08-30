import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const repoRoot = path.resolve(import.meta.dirname, '../..');

test('does not let pnpm mutate dependencies before dry-run scripts start', async () => {
  const workspace = await readFile(
    path.join(repoRoot, 'pnpm-workspace.yaml'),
    'utf8',
  );

  assert.match(workspace, /^verifyDepsBeforeRun: false$/mu);
});

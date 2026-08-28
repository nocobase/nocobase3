import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { buildApplicationWorkflows } from '../build/index.js';

const authoringEntry = fileURLToPath(new URL('../index.ts', import.meta.url));
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots
      .splice(0)
      .map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

describe('application workflow builder', () => {
  it('treats a missing source root as an application with no workflows', async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), 'workflow-application-build-empty-'),
    );
    roots.push(root);
    const distRoot = path.join(root, 'dist/server/workflows');

    await expect(
      buildApplicationWorkflows({
        sourceRoot: path.join(root, 'server/workflows'),
        distRoot,
      }),
    ).resolves.toEqual({ packages: 0, artifacts: [] });
    await expect(fs.readdir(distRoot)).resolves.toEqual([]);
  });

  it('builds workflow package directories and replaces stale output', async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), 'workflow-application-build-'),
    );
    roots.push(root);
    const sourceRoot = path.join(root, 'server/workflows');
    const distRoot = path.join(root, 'dist/server/workflows');
    const packageRoot = path.join(sourceRoot, 'sample');
    await fs.mkdir(packageRoot, { recursive: true });
    await fs.mkdir(path.join(distRoot, 'stale'), { recursive: true });
    await fs.writeFile(path.join(distRoot, 'stale/workflow.json'), '{}');
    await fs.writeFile(
      path.join(packageRoot, 'workflow.ts'),
      `import { defineWorkflow } from ${JSON.stringify(authoringEntry)};\nexport default defineWorkflow({ title: 'Sample', nodes: [] });\n`,
    );

    const result = await buildApplicationWorkflows({ sourceRoot, distRoot });

    expect(result.packages).toBe(1);
    expect(result.artifacts).toHaveLength(1);
    await expect(fs.readdir(distRoot)).resolves.toEqual(['sample']);
    await expect(
      fs.readFile(path.join(result.artifacts[0], 'workflow.json'), 'utf8'),
    ).resolves.toContain('"key": "sample"');
  });
});

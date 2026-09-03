import { execFile } from 'node:child_process';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const packageRoot = path.resolve(import.meta.dirname, '..');

describe('workflow CLI', () => {
  it('uses TypeScript in the source workspace and compiled JavaScript when published', () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'),
    ) as {
      bin?: Record<string, string>;
      exports?: Record<string, unknown>;
      publishConfig?: {
        bin?: Record<string, string>;
        exports?: Record<string, unknown>;
      };
    };

    expect(manifest.bin?.workflow).toBe('./bin/workflow.ts');
    expect(manifest.publishConfig?.bin?.workflow).toBe(
      './dist/bin/workflow.js',
    );
    expect(manifest.exports?.['./build']).toEqual({
      types: './build/index.ts',
      import: './build/index.ts',
    });
    expect(manifest.publishConfig?.exports?.['./build']).toEqual({
      types: './dist/build/index.d.ts',
      import: './dist/build/index.js',
    });
  });

  it('runs from source before the package is built and accepts a relative package path', async () => {
    const fixture = path.relative(
      packageRoot,
      path.join(
        packageRoot,
        'skill-evals/nocobase3-workflow-manage/fixtures/workflows/valid-quotation',
      ),
    );
    await execFileAsync(
      process.execPath,
      [path.join(packageRoot, 'bin/workflow.ts'), 'check', fixture],
      { cwd: packageRoot },
    );
  });

  it('builds application workflow artifacts with default paths', async () => {
    const root = await fsPromises.mkdtemp(
      path.join(os.tmpdir(), 'workflow-cli-build-'),
    );
    try {
      const packagePath = path.join(root, 'server/workflows/example');
      await fsPromises.mkdir(packagePath, { recursive: true });
      await fsPromises.writeFile(
        path.join(packagePath, 'workflow.ts'),
        `import { defineWorkflow } from ${JSON.stringify(path.join(packageRoot, 'index.ts'))};\nexport default defineWorkflow({ title: 'CLI build', nodes: [] });\n`,
      );
      await execFileAsync(
        process.execPath,
        [path.join(packageRoot, 'bin/workflow.ts'), 'build'],
        { cwd: root },
      );
      const keyRoot = path.join(root, 'dist/server/workflows/example');
      const [digest] = await fsPromises.readdir(keyRoot);
      await expect(
        fsPromises.readFile(
          path.join(keyRoot, digest, 'workflow.json'),
          'utf8',
        ),
      ).resolves.toContain('"title": "CLI build"');
    } finally {
      await fsPromises.rm(root, { recursive: true, force: true });
    }
  });
});

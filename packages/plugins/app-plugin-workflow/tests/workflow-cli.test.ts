import { execFile } from 'node:child_process';
import fs from 'node:fs';
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
      publishConfig?: { bin?: Record<string, string> };
    };

    expect(manifest.bin?.workflow).toBe('./bin/workflow.ts');
    expect(manifest.publishConfig?.bin?.workflow).toBe(
      './dist/bin/workflow.js',
    );
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
});

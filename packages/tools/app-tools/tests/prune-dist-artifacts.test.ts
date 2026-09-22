// @vitest-environment node

import { spawnSync } from 'node:child_process';
import {
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

const scriptPath = path.resolve(
  import.meta.dirname,
  '../src/scripts/utils/prune-dist-artifacts.mjs',
);
const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function createRoot(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nocobase-prune-dist-'));
  temporaryDirectories.push(root);
  return root;
}

function write(root: string, relativePath: string, content = 'x'): string {
  const filePath = path.join(root, ...relativePath.split('/'));
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, content);
  return filePath;
}

function prune(root: string) {
  return spawnSync(process.execPath, [scriptPath], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, NOCOBASE_TOOL_ROOT: root },
    timeout: 20_000,
  });
}

describe('deployment tree pruning', () => {
  it('removes declarations everywhere and third-party maps and docs only', () => {
    const root = createRoot();
    const removed = [
      'dist/node_modules/openai/index.d.ts',
      'dist/node_modules/openai/index.d.cts',
      'dist/node_modules/openai/index.d.mts',
      'dist/node_modules/openai/index.js.map',
      'dist/node_modules/openai/README.md',
      'dist/node_modules/openai/CHANGELOG.markdown',
      'dist/node_modules/@nocobase/app-server/dist/index.d.ts',
      'dist/vendor/@nocobase/app-plugin-demo/dist/index.d.ts',
    ].map((file) => write(root, file));
    const kept = [
      'dist/node_modules/openai/index.js',
      'dist/node_modules/openai/LICENSE',
      'dist/node_modules/openai/LICENSE.md',
      'dist/node_modules/openai/NOTICE',
      'dist/node_modules/openai/COPYING',
      // This repository's own packages keep maps for production stack traces and Markdown for Skills.
      'dist/node_modules/@nocobase/app-server/dist/index.js.map',
      'dist/node_modules/@nocobase/app-plugin-demo/skills/demo/SKILL.md',
      'dist/vendor/@nocobase/app-plugin-demo/dist/index.js.map',
      // Compiler inputs rather than declarations describing the compiler.
      'dist/node_modules/typescript/lib/lib.es2024.d.ts',
      'dist/node_modules/typescript/lib/typescript.js',
      // Outside the pruned trees entirely.
      'dist/server/standalone.js.map',
      'dist/server/types.d.ts',
    ].map((file) => write(root, file));

    const result = prune(root);

    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(
      /^Removed 8 declaration, source map, and documentation files from the deployment tree \(.* MB\)\.\n$/,
    );
    for (const file of removed) expect(existsSync(file)).toBe(false);
    for (const file of kept) expect(existsSync(file)).toBe(true);
  });

  it('counts a hard-linked vendor and node_modules file once and removes both paths', () => {
    const root = createRoot();
    const vendored = write(
      root,
      'dist/vendor/@nocobase/demo/dist/index.d.ts',
      'declare const x: number;',
    );
    const installed = path.join(
      root,
      'dist/node_modules/@nocobase/demo/dist/index.d.ts',
    );
    mkdirSync(path.dirname(installed), { recursive: true });
    linkSync(vendored, installed);

    const result = prune(root);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Removed 2 declaration');
    expect(existsSync(vendored)).toBe(false);
    expect(existsSync(installed)).toBe(false);
  });

  it('reports zero removals when the tree has no vendor directory and nothing to prune', () => {
    const root = createRoot();
    write(root, 'dist/node_modules/pg/index.js');

    const result = prune(root);

    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Removed 0 declaration');
  });

  it('fails when dist is missing', () => {
    const root = createRoot();

    const result = prune(root);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Missing dist. Run pnpm build first.');
  });
});

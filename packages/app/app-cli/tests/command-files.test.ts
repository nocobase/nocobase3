// Commands are found by their path, so a command's directory name is its topic. `dist` is the one topic whose
// directory name every tool here ignores by default — the repository's .gitignore, both Prettier ignore files and the
// shared ESLint preset — and the exceptions that let `src/commands/dist/` through are four separate lines in four
// files. Losing one fails silently: a new command file never reaches git, or is never formatted or linted. This test
// is what notices.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { ESLint } from 'eslint';
import { getFileInfo } from 'prettier';
import { beforeAll, describe, expect, it } from 'vitest';

import { discoverCommandFiles } from '../src/runtime/discover.ts';

const packageRoot = path.resolve(import.meta.dirname, '..');
const repositoryRoot = path.resolve(packageRoot, '..', '..', '..');

let files: string[];

beforeAll(async () => {
  files = Object.values(
    await discoverCommandFiles(
      path.join(packageRoot, 'src', 'commands'),
      '.ts',
    ),
  );
});

describe('command files', () => {
  it('include the dist topic, which the ignore exceptions exist for', () => {
    expect(files.map((file) => path.relative(packageRoot, file))).toEqual(
      expect.arrayContaining([
        path.join('src', 'commands', 'dist', 'check.ts'),
        path.join('src', 'commands', 'dist', 'retarget.ts'),
      ]),
    );
  });

  it('are not ignored by git', () => {
    const result = spawnSync('git', ['check-ignore', '--', ...files], {
      cwd: repositoryRoot,
      encoding: 'utf8',
    });

    // `check-ignore` prints each ignored path and exits 1 when none is.
    expect(result.stdout.trim()).toBe('');
    expect(result.status).toBe(1);
  });

  it('are not ignored by Prettier, from the package or from the repository root', async () => {
    const ignored: string[] = [];
    for (const ignorePath of [
      path.join(packageRoot, '.prettierignore'),
      path.join(repositoryRoot, '.prettierignore'),
    ]) {
      for (const file of files) {
        if ((await getFileInfo(file, { ignorePath })).ignored) {
          ignored.push(`${path.relative(packageRoot, file)} (${ignorePath})`);
        }
      }
    }
    expect(ignored).toEqual([]);
  });

  it('are not ignored by ESLint', async () => {
    const eslint = new ESLint({ cwd: packageRoot });
    const ignored: string[] = [];
    for (const file of files) {
      if (await eslint.isPathIgnored(file)) {
        ignored.push(path.relative(packageRoot, file));
      }
    }
    expect(ignored).toEqual([]);
  });
});

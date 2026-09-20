import {
  mkdtemp,
  mkdir,
  readFile,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { runAppTool } from '../src/index.js';

it('uses the supplied app root rather than the tooling package or working directory', async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), 'app-tools-root-'));
  try {
    await mkdir(path.join(rootDir, 'dist/server'), { recursive: true });
    await writeFile(
      path.join(rootDir, 'dist/server/standalone.js'),
      `
      import { writeFileSync } from 'node:fs';
      export function startServer() { writeFileSync(${JSON.stringify(path.join(rootDir, 'started'))}, process.cwd()); }
    `,
    );
    expect(await runAppTool('start', { rootDir, args: [] })).toBe(0);
    expect(await readFile(path.join(rootDir, 'started'), 'utf8')).toBe(
      await realpath(rootDir),
    );
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

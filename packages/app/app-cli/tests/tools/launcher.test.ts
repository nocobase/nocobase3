import { spawnSync } from 'node:child_process';
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
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { runAppTool } from '../../src/tools/run-tool.ts';

it('uses the supplied app root rather than the tooling package or working directory', async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), 'app-cli-root-'));
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

it('fails with a build hint when dist/server/standalone.js is missing', async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), 'app-cli-no-dist-'));
  try {
    // `runAppTool` inherits this process's stderr, so the exit code comes from it and the hint is read back by
    // running the same entry with a pipe.
    expect(await runAppTool('start', { rootDir, args: [] })).toBe(1);

    const entry = fileURLToPath(
      new URL('../../src/tools/scripts/start.mjs', import.meta.url),
    );
    const result = spawnSync(process.execPath, [entry], {
      cwd: rootDir,
      encoding: 'utf8',
      env: { ...process.env, NOCOBASE_TOOL_ROOT: rootDir },
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'Missing dist/server/standalone.js. Run pnpm build first.',
    );
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

// @vitest-environment node
// What the runner guarantees around a command: a runtime the command left open is closed and the command is named,
// and a failure outside any command still answers --json with one document.
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const run = promisify(execFile);
const packageRoot = path.resolve(import.meta.dirname, '..');
const bin = path.join(packageRoot, 'bin/run.js');
let app: string;

beforeAll(async () => {
  app = await mkdtemp(path.join(os.tmpdir(), 'runner-safety-'));
  await writeFile(
    path.join(app, 'package.json'),
    JSON.stringify({
      name: 'runner-safety-fixture',
      type: 'module',
      nocobase: { templateKind: 'default' },
    }),
  );
  // The runner loads the application's TypeScript, and this repository's workspace sources, through tsx resolved from
  // the application; a generated application has it installed, the fixture borrows this package's.
  await symlink(
    path.join(packageRoot, 'node_modules'),
    path.join(app, 'node_modules'),
  );
  await mkdir(path.join(app, 'cli', 'commands'), { recursive: true });
  const source = (file: string): string =>
    JSON.stringify(pathToFileURL(path.join(packageRoot, 'src', file)).href);
  await writeFile(
    path.join(app, 'cli', 'plugins.ts'),
    `import { defineCliPlugins } from ${source('index.ts')};\nexport default defineCliPlugins([]);\n`,
  );
  // Stands in for a command that loaded a runtime and never closed it.
  await writeFile(
    path.join(app, 'cli', 'commands', 'leak.ts'),
    `import { AppCommand } from ${source('index.ts')};
import { trackOpenRuntime } from ${source('runtime/command-store.ts')};

export default class Leak extends AppCommand {
  static override summary = 'Leaves a runtime open.';
  public async run(): Promise<{ leaked: boolean }> {
    await this.parse(Leak);
    trackOpenRuntime({ close: async () => { process.stderr.write('runtime closed\\n'); } });
    return { leaked: true };
  }
}
`,
  );
  // Keeps printing after its reader has gone, the way a command reporting progress on stdout would.
  await writeFile(
    path.join(app, 'cli', 'commands', 'chatty.ts'),
    `import { AppCommand } from ${source('index.ts')};
import { trackOpenRuntime } from ${source('runtime/command-store.ts')};

export default class Chatty extends AppCommand {
  static override summary = 'Prints more than a reader wants.';
  public async run(): Promise<void> {
    await this.parse(Chatty);
    trackOpenRuntime({ close: async () => { process.stderr.write('runtime closed\\n'); } });
    try {
      // Paced so the writes outlast the reader: a burst would fit in the pipe's buffer before it closed.
      for (let line = 0; line < 200; line += 1) {
        this.log(\`line \${line}\`);
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
    } finally {
      process.stderr.write('command unwound\\n');
    }
  }
}
`,
  );
}, 60_000);

afterAll(async () => {
  await rm(app, { recursive: true, force: true });
});

async function nocobase(
  argv: string[],
): Promise<{ stdout: string; stderr: string; code: number }> {
  try {
    const { stdout, stderr } = await run(process.execPath, [bin, ...argv], {
      cwd: app,
      env: { ...process.env, NOCOBASE_CONTENT_TYPE: '' },
    });
    return { stdout, stderr, code: 0 };
  } catch (error) {
    const failed = error as { stdout: string; stderr: string; code: number };
    return { stdout: failed.stdout, stderr: failed.stderr, code: failed.code };
  }
}

describe('the runner', () => {
  it('closes a runtime a command left open and names the command', async () => {
    const result = await nocobase(['app', 'leak', '--json']);
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      command: 'app leak',
      result: { leaked: true },
    });
    expect(result.stderr).toContain(
      'app leak left the application open; wrap it in withApp().',
    );
    expect(result.stderr).toContain('runtime closed');
    expect(result.code).toBe(0);
  }, 60_000);

  it('exits 0 when a reader closes stdout early, as `| head` does', async () => {
    const { spawn } = await import('node:child_process');
    const child = spawn(process.execPath, [bin, 'commands', '--json'], {
      cwd: app,
      env: { ...process.env, NOCOBASE_CONTENT_TYPE: '' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += String(chunk);
    });
    // Read the first chunk, then close the pipe the way `head -1` does.
    child.stdout.once('data', () => child.stdout.destroy());
    const code = await new Promise<number | null>((resolve) =>
      child.once('close', resolve),
    );
    expect(code).toBe(0);
    expect(stderr).not.toContain('unsettled top-level await');
  }, 60_000);

  it('lets a command still printing when the reader leaves unwind, and closes what it left open', async () => {
    const { spawn } = await import('node:child_process');
    const child = spawn(process.execPath, [bin, 'app', 'chatty'], {
      cwd: app,
      env: { ...process.env, NOCOBASE_CONTENT_TYPE: '' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += String(chunk);
    });
    child.stdout.once('data', () => child.stdout.destroy());
    const code = await new Promise<number | null>((resolve) =>
      child.once('close', resolve),
    );
    expect(code).toBe(0);
    expect(stderr).toContain('command unwound');
    expect(stderr).toContain('runtime closed');
  }, 60_000);

  it('answers --json with one failure document for a command that does not exist', async () => {
    const result = await nocobase(['no-such-command', '--json']);
    expect(JSON.parse(result.stdout)).toMatchObject({
      schemaVersion: 1,
      ok: false,
      status: 'failure',
      command: 'no-such-command',
      error: { message: expect.stringContaining('no-such-command') },
    });
    expect(result.code).not.toBe(0);
  }, 60_000);
});

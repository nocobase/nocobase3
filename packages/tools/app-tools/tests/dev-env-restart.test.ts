// @vitest-environment node
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, expect, it } from 'vitest';

const processes: ChildProcess[] = [];
const directories: string[] = [];
const supervisor = new URL('../src/scripts/dev/supervisor.mjs', import.meta.url)
  .href;
const envLoader = new URL(
  '../node_modules/@nocobase/app-server/src/node/scope.ts',
  import.meta.url,
).href;

async function waitFor(check: () => Promise<boolean>) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  throw new Error('Timed out waiting for development supervisor');
}

async function fixture(strict = false) {
  const root = await mkdtemp(path.join(tmpdir(), 'dev-env-restart-'));
  directories.push(root);
  const log = path.join(root, 'events.jsonl');
  await writeFile(log, '');
  await writeFile(path.join(root, '.env'), 'VALUE=base\nREMOVED=present\n');
  const entry = path.join(root, 'child.mjs');
  await writeFile(
    entry,
    `
    import { appendFileSync } from 'node:fs';
    import { loadStandaloneAppEnv } from ${JSON.stringify(envLoader)};
    const env = loadStandaloneAppEnv({ rootDir: ${JSON.stringify(root)} });
    const record = (event) => appendFileSync(${JSON.stringify(log)}, JSON.stringify({event, value: env.VALUE, removed: env.REMOVED, shell: env.SHELL_OVERRIDE, pid: process.pid}) + '\\n');
    record('start');
    setInterval(() => {}, 1000);
    process.on('SIGUSR2', () => process.exit(7));
    process.on('SIGTERM', () => setTimeout(() => { record('stop'); process.exit(0); }, 150));
  `,
  );
  const launcher = path.join(root, 'launcher.mjs');
  await writeFile(
    launcher,
    `
    import { superviseDevelopment } from ${JSON.stringify(supervisor)};
    process.exitCode = await superviseDevelopment({ rootDir: ${JSON.stringify(root)}, entry: ${JSON.stringify(entry)} });
  `,
  );
  const child = spawn(
    process.execPath,
    ['--import', createRequire(import.meta.url).resolve('tsx'), launcher],
    {
      cwd: path.resolve(import.meta.dirname, '..'),
      env: {
        ...process.env,
        SHELL_OVERRIDE: 'shell',
        NOCOBASE_STRICT_STARTUP: String(strict),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  processes.push(child);
  const events = async (): Promise<
    Array<{
      event: string;
      pid: number;
      value?: string;
      removed?: string;
      shell: string;
    }>
  > =>
    (await readFile(log, 'utf8'))
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  await waitFor(async () => (await events()).length === 1);
  return { root, child, events };
}

afterEach(async () => {
  for (const child of processes.splice(0)) {
    if (child.exitCode === null) {
      const closed = new Promise<void>((resolve) =>
        child.once('close', () => resolve()),
      );
      child.kill('SIGTERM');
      await closed;
    }
  }
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true });
});

it('reloads dotenv values after creation, atomic replacement and deletion without overlapping runs', async () => {
  const { root, events } = await fixture();
  await writeFile(
    path.join(root, '.env.local'),
    'VALUE=local\nSHELL_OVERRIDE=file\n',
  );
  await waitFor(async () => (await events()).length === 3);
  expect((await events()).map((event) => event.event)).toEqual([
    'start',
    'stop',
    'start',
  ]);
  expect((await events()).at(-1)).toMatchObject({
    value: 'local',
    shell: 'shell',
  });
  await writeFile(path.join(root, '.env.next'), 'VALUE=updated\n');
  await rename(path.join(root, '.env.next'), path.join(root, '.env'));
  await waitFor(async () => (await events()).length === 5);
  expect((await events()).at(-1)?.removed).toBeUndefined();
  await rm(path.join(root, '.env.local'));
  await waitFor(async () => (await events()).length === 7);
  expect((await events()).at(-1)?.value).toBe('updated');
});

it('does not restart in strict startup mode', async () => {
  const { root, events } = await fixture(true);
  await writeFile(path.join(root, '.env.local'), 'VALUE=local\n');
  await new Promise((resolve) => setTimeout(resolve, 800));
  expect(await events()).toHaveLength(1);
});

it('preserves an unexpected development process failure instead of restarting it', async () => {
  const { child, events } = await fixture();
  const closed = new Promise<number | null>((resolve) =>
    child.once('close', resolve),
  );
  const first = (await events())[0];
  process.kill(first.pid, 'SIGUSR2');
  expect(await closed).toBe(7);
  expect(await events()).toHaveLength(1);
});

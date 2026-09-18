import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const [backend, ...extra] = process.argv.slice(2);
if (!['redis', 'postgres'].includes(backend) || extra.length) {
  console.error(
    'Usage: node tests/run-persistent-queue.mjs <redis|postgres> (external QUEUE_TEST_REDIS_PORT or QUEUE_TEST_PG_PORT required; no Docker)',
  );
  process.exit(1);
}
const portVariable =
  backend === 'redis' ? 'QUEUE_TEST_REDIS_PORT' : 'QUEUE_TEST_PG_PORT';
const port = Number(process.env[portVariable]);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error(
    `Supply an isolated external ${portVariable} in the range 1..65535`,
  );
  process.exit(1);
}
const root = fileURLToPath(new URL('../', import.meta.url));
const env = { ...process.env, QUEUE_TEST_BACKEND: backend };
let active;
let interrupted = false;
function terminate(child) {
  try {
    if (process.platform === 'win32') child.kill('SIGKILL');
    else if (child.pid) process.kill(-child.pid, 'SIGKILL');
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }
}
function stop() {
  interrupted = true;
  if (active) terminate(active);
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
async function run(args) {
  if (interrupted) throw new Error('Persistent queue acceptance interrupted');
  await new Promise((resolve, reject) => {
    const child = spawn('pnpm', args, {
      cwd: root,
      env,
      stdio: 'inherit',
      detached: process.platform !== 'win32',
    });
    active = child;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      terminate(child);
    }, 120_000);
    child.once('error', (error) => {
      clearTimeout(timer);
      if (active === child) active = undefined;
      reject(error);
    });
    child.once('close', (code, signal) => {
      clearTimeout(timer);
      if (active === child) active = undefined;
      if (code !== 0 || timedOut || interrupted) {
        reject(
          new Error(
            `pnpm ${args.join(' ')} failed: code=${code} signal=${signal} timeout=${timedOut}`,
          ),
        );
      } else resolve();
    });
  });
}
let temporary;
try {
  temporary = await mkdtemp(join(tmpdir(), 'host-persistent-queue-'));
  const report = join(temporary, 'results.json');
  console.log(
    `Host persistent competition: ${backend} at 127.0.0.1:${port}; external infrastructure is never started or stopped`,
  );
  // Registry tests deliberately import dist, not unbuilt Host source.
  await run(['build']);
  await run([
    'exec',
    'vitest',
    'run',
    '--config',
    'vitest.queue-persistent.config.ts',
    '--reporter=default',
    '--reporter=json',
    `--outputFile=${report}`,
    '--passWithNoTests=false',
  ]);
  const result = JSON.parse(await readFile(report, 'utf8'));
  if (
    !result.success ||
    result.numTotalTests !== 1 ||
    result.numPassedTests !== 1 ||
    result.numPendingTests !== 0 ||
    result.numTodoTests !== 0
  ) {
    throw new Error(
      'Persistent acceptance must execute exactly one passing test, with no skips or todos',
    );
  }
  console.log(
    `PASS Host ${backend}: shared-target competition and surviving application ownership (1 executed test)`,
  );
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  if (temporary) await rm(temporary, { recursive: true, force: true });
  process.removeListener('SIGINT', stop);
  process.removeListener('SIGTERM', stop);
}

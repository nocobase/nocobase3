import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const [backend, ...filters] = process.argv.slice(2);
const targets = ['inMemory', 'redis', 'cluster'];
if (
  !targets.includes(backend) ||
  filters.some((filter) => filter.startsWith('-'))
) {
  console.error(
    `Usage: node scripts/test-integration.mjs <${targets.join('|')}> [test-file-filter ...]`,
  );
  process.exit(1);
}
const project = `nbq-${process.pid}-${Date.now().toString(36)}`;
const lock = path.join(os.tmpdir(), 'nocobase-queue-integration.lock');
let active;
let interrupted = false;
let escalation;
const terminate = (child, signal) => {
  try {
    if (process.platform === 'win32') child.kill(signal);
    else if (child.pid) process.kill(-child.pid, signal);
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }
};
const stop = () => {
  interrupted = true;
  if (active) {
    const child = active;
    terminate(child, 'SIGTERM');
    escalation = setTimeout(() => terminate(child, 'SIGKILL'), 5000);
  }
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
async function run(
  command,
  args,
  { env = process.env, timeout = 180_000 } = {},
) {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
    });
    active = child;
    let output = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      terminate(child, 'SIGKILL');
    }, timeout);
    child.stdout.on('data', (data) => {
      output += data;
      process.stdout.write(data);
    });
    child.stderr.on('data', (data) => process.stderr.write(data));
    child.once('error', reject);
    child.once('close', (code, signal) => {
      clearTimeout(timer);
      clearTimeout(escalation);
      if (active === child) active = undefined;
      if (code !== 0 || timedOut)
        reject(
          new Error(
            `${command} failed: code=${code} signal=${signal} timeout=${timedOut}`,
          ),
        );
      else resolve(output.trim());
    });
  });
}
const composeArgs = [
  'compose',
  '--project-name',
  project,
  '--file',
  'tests/integration/compose.yml',
  '--profile',
  backend,
];
const compose = (...args) => run('docker', [...composeArgs, ...args]);
let locked = false;
let temporary;
let started = false;
try {
  await mkdir(lock);
  locked = true;
  await writeFile(
    path.join(lock, 'owner.json'),
    JSON.stringify({ pid: process.pid, project }),
  );
  temporary = await mkdtemp(path.join(os.tmpdir(), `${project}-`));
  const env = {
    ...process.env,
    QUEUE_TEST_BACKEND: backend,
    QUEUE_TEST_RUN: project,
  };
  if (backend !== 'inMemory') {
    started = true;
    await compose('up', '--detach', '--wait', '--wait-timeout', '60', backend);
    const port = async (internal) => {
      const address = await compose('port', backend, String(internal));
      const match = /^127\.0\.0\.1:(\d+)$/u.exec(address);
      if (!match)
        throw new Error(`Expected isolated loopback port, got ${address}`);
      return match[1];
    };
    if (backend === 'redis') env.QUEUE_TEST_REDIS_PORT = await port(6379);
    else if (backend === 'cluster') {
      const ports = [];
      for (const internal of [7000, 7001, 7002])
        ports.push(await port(internal));
      env.QUEUE_TEST_CLUSTER_PORTS = ports.join(',');
    }
  }
  if (interrupted) throw new Error('Integration run interrupted');
  const report = path.join(temporary, 'results.json');
  await run(
    'pnpm',
    [
      'exec',
      'vitest',
      'run',
      ...(filters.length ? filters : ['tests/integration']),
      '--reporter=default',
      '--reporter=json',
      `--outputFile=${report}`,
      '--passWithNoTests=false',
    ],
    { env },
  );
  const result = JSON.parse(await readFile(report, 'utf8'));
  if (
    result.numTotalTests < 1 ||
    result.numPassedTests !== result.numTotalTests ||
    result.numPendingTests > 0 ||
    result.numTodoTests > 0 ||
    !result.success
  ) {
    throw new Error(
      'Integration run must execute at least one test with no failures, skips or todos',
    );
  }
  console.log(`PASS ${backend}: ${result.numPassedTests} executed tests`);
} catch (error) {
  console.error(error);
  if (!locked)
    console.error(
      `Another queue suite may be active. Inspect ${lock}/owner.json; do not remove a live runner's lock.`,
    );
  process.exitCode = 1;
} finally {
  try {
    if (started) {
      try {
        await compose('logs', '--no-color');
      } finally {
        await compose(
          'down',
          '--volumes',
          '--remove-orphans',
          '--timeout',
          '5',
        );
      }
      const remaining = await run('docker', [
        'ps',
        '-aq',
        '--filter',
        `label=com.docker.compose.project=${project}`,
      ]);
      if (remaining) {
        console.error(
          `Integration containers leaked for ${project}: ${remaining}`,
        );
        process.exitCode = 1;
      } else console.log(`PASS ${project}: no remaining containers`);
    }
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    if (temporary) await rm(temporary, { force: true, recursive: true });
    if (locked) await rm(lock, { recursive: true, force: true });
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
  }
}

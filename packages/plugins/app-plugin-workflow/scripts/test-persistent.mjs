import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const [backend, ...extra] = process.argv.slice(2);
if (!['redis', 'postgres'].includes(backend) || extra.length) {
  throw new Error(
    'Usage: node scripts/test-persistent.mjs <redis|postgres> (requires isolated queue runner ports)',
  );
}
if (
  process.env.QUEUE_TEST_BACKEND !== backend ||
  !process.env.QUEUE_TEST_RUN?.startsWith('nbq-')
) {
  throw new Error(
    'Use the selected isolated queue runner environment; never supply a user server',
  );
}
const port = Number(
  process.env[
    backend === 'redis' ? 'QUEUE_TEST_REDIS_PORT' : 'QUEUE_TEST_PG_PORT'
  ],
);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error('Missing isolated queue runner port');
const temporary = await mkdtemp(
  path.join(tmpdir(), 'workflow-acceptance-report-'),
);
const report = path.join(temporary, 'results.json');
try {
  await new Promise((resolve, reject) => {
    const child = spawn(
      'pnpm',
      [
        'exec',
        'vitest',
        'run',
        '--reporter=default',
        '--reporter=json',
        `--outputFile=${report}`,
      ],
      {
        cwd: fileURLToPath(new URL('../', import.meta.url)),
        env: { ...process.env, WORKFLOW_PERSISTENT_ACCEPTANCE: '1' },
        stdio: 'inherit',
        detached: process.platform !== 'win32',
      },
    );
    const terminate = (signal) => {
      try {
        if (process.platform === 'win32') child.kill(signal);
        else if (child.pid) process.kill(-child.pid, signal);
      } catch (error) {
        if (error.code !== 'ESRCH') throw error;
      }
    };
    let escalation;
    let interrupted = false;
    const stop = () => {
      interrupted = true;
      terminate('SIGTERM');
      escalation ??= setTimeout(() => terminate('SIGKILL'), 5000);
    };
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
    const timeout = setTimeout(stop, 300_000);
    const cleanup = () => {
      clearTimeout(timeout);
      clearTimeout(escalation);
      process.removeListener('SIGINT', stop);
      process.removeListener('SIGTERM', stop);
    };
    child.once('error', (error) => {
      cleanup();
      reject(error);
    });
    child.once('close', (code, signal) => {
      cleanup();
      if (code === 0 && !interrupted) resolve();
      else
        reject(
          new Error(
            `Workflow acceptance failed: ${code}/${signal}; interrupted=${interrupted}`,
          ),
        );
    });
  });
  const result = JSON.parse(await readFile(report, 'utf8'));
  if (
    !result.success ||
    result.numTotalTests < 2 ||
    result.numPassedTests !== result.numTotalTests ||
    result.numPendingTests ||
    result.numTodoTests
  ) {
    throw new Error(
      'Workflow acceptance must execute both restart/business-consumer and actual engine-redelivery tests without skips or todos',
    );
  }
  console.log(
    `PASS Workflow ${backend}: fresh-process restart, independent business-consumer idempotency, and actual engine post-commit redelivery (${result.numPassedTests} tests)`,
  );
} finally {
  await rm(temporary, { recursive: true, force: true });
}

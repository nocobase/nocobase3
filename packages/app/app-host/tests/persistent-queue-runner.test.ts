import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

it.each([
  { args: [], port: '', error: 'Usage:' },
  { args: ['inMemory'], port: '12345', error: 'Usage:' },
  { args: ['redis', 'extra'], port: '12345', error: 'Usage:' },
  { args: ['redis'], port: '', error: 'QUEUE_TEST_REDIS_PORT' },
  { args: ['redis'], port: '65536', error: 'QUEUE_TEST_REDIS_PORT' },
  { args: ['postgres'], port: '', error: 'QUEUE_TEST_PG_PORT' },
  { args: ['postgres'], port: '1.5', error: 'QUEUE_TEST_PG_PORT' },
])(
  'rejects invalid persistent-runner inputs before build or backend access: $args / $port',
  ({ args, port, error }) => {
    const result = spawnSync(
      process.execPath,
      [
        fileURLToPath(new URL('./run-persistent-queue.mjs', import.meta.url)),
        ...args,
      ],
      {
        encoding: 'utf8',
        timeout: 5000,
        env: {
          ...process.env,
          QUEUE_TEST_REDIS_PORT: port,
          QUEUE_TEST_PG_PORT: port,
        },
      },
    );
    expect(result.error).toBeUndefined();
    expect(result.signal).toBeNull();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(error);
    expect(result.stdout).toBe('');
  },
);

import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';

import { createLogger, type DestinationStream } from '@nocobase/logging';

import { requestLogger } from '../src/logging/index.js';

describe('requestLogger', () => {
  it('logs request input and successful response output', async () => {
    const output = createMemoryDestination();
    const router = new Hono();
    router.use(
      '*',
      requestLogger({
        app: 'main',
        logger: createLogger({}, output),
      }),
    );
    router.get('/users/:id', (context) => context.json({ ok: true }));

    await router.request('/users/42?active=true', {
      headers: {
        authorization: 'secret',
        'user-agent': 'vitest',
        'x-request-source': 'cli',
      },
    });

    expect(output.records()).toEqual([
      expect.objectContaining({
        level: 30,
        app: 'main',
        req: {
          method: 'GET',
          path: '/users/42',
          query: { active: 'true' },
          headers: {
            'user-agent': 'vitest',
            'x-request-source': 'cli',
          },
        },
        msg: 'request started',
      }),
      expect.objectContaining({
        level: 30,
        app: 'main',
        req: {
          method: 'GET',
          path: '/users/42',
          route: '/users/:id',
          params: { id: '42' },
        },
        res: expect.objectContaining({ status: 200 }),
        durationMs: expect.any(Number),
        msg: 'request completed',
      }),
    ]);
  });

  it('uses warning and error levels for unsuccessful responses', async () => {
    const output = createMemoryDestination();
    const router = new Hono();
    router.onError((error, context) =>
      context.json({ error: error.message }, 500),
    );
    router.use('*', requestLogger({ logger: createLogger({}, output) }));
    router.get('/missing', (context) =>
      context.json({ error: 'missing' }, 404),
    );
    router.get('/error', () => {
      throw new Error('failed');
    });

    await router.request('/missing');
    await router.request('/error');

    const completed = output
      .records()
      .filter((record) => record.msg !== 'request started');
    expect(completed).toEqual([
      expect.objectContaining({
        level: 40,
        res: expect.objectContaining({ status: 404 }),
        msg: 'request completed',
      }),
      expect.objectContaining({
        level: 50,
        res: expect.objectContaining({ status: 500 }),
        err: expect.objectContaining({ message: 'failed' }),
        msg: 'request failed',
      }),
    ]);
  });

  it('supports route-level skipping without adding request state', async () => {
    const output = createMemoryDestination();
    const router = new Hono();
    router.use(
      '*',
      requestLogger({
        logger: createLogger({}, output),
        skip: (context) => context.req.path === '/healthz',
      }),
    );
    router.get('/healthz', (context) => context.json({ ok: true }));

    await router.request('/healthz');

    expect(output.records()).toEqual([]);
  });
});

type MemoryDestination = DestinationStream & {
  records(): Array<Record<string, unknown>>;
};

function createMemoryDestination(): MemoryDestination {
  const lines: string[] = [];
  return {
    write(message: string): void {
      lines.push(message);
    },
    records(): Array<Record<string, unknown>> {
      return lines
        .join('')
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line) as Record<string, unknown>);
    },
  };
}

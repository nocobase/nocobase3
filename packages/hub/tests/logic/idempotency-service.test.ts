// @vitest-environment node

import { afterEach, describe, expect, it } from 'vitest';

import {
  createHubDatabase,
  type HubDatabaseRuntime,
} from '../../server/hub/database.ts';
import {
  HubIdempotencyService,
  type IdempotencyExecutionResult,
} from '../../server/hub/idempotency-service.ts';

describe('HubIdempotencyService', () => {
  let database: HubDatabaseRuntime | undefined;

  afterEach(async () => {
    await database?.close();
    database = undefined;
  });

  it('replays the same response and rejects key reuse with another body', async () => {
    database = createHubDatabase({ filename: ':memory:' });
    await database.ready;
    const service = new HubIdempotencyService(database.connection);
    let calls = 0;

    const execute = (
      payload: Record<string, unknown>,
    ): Promise<IdempotencyExecutionResult<{ id: string }>> =>
      service.execute(
        {
          actorId: 'owner-1',
          endpoint: 'POST /apps',
          scopeKey: 'global',
          idempotencyKey: 'create-sales',
          payload,
        },
        async () => {
          calls += 1;
          return { id: 'application-1' };
        },
      );

    await expect(execute({ name: 'Sales', slug: 'sales' })).resolves.toEqual({
      value: { id: 'application-1' },
      idempotent: false,
    });
    await expect(execute({ slug: 'sales', name: 'Sales' })).resolves.toEqual({
      value: { id: 'application-1' },
      idempotent: true,
    });
    expect(calls).toBe(1);

    await expect(
      execute({ slug: 'sales', name: 'Different' }),
    ).rejects.toMatchObject({
      code: 'IDEMPOTENCY_KEY_CONFLICT',
      status: 409,
    });
  });

  it('does not persist failed executions as successful replays', async () => {
    database = createHubDatabase({ filename: ':memory:' });
    await database.ready;
    const service = new HubIdempotencyService(database.connection);
    const request = {
      actorId: 'owner-1',
      endpoint: 'POST /apps',
      scopeKey: 'global',
      idempotencyKey: 'retryable',
      payload: { slug: 'retryable' },
    };

    await expect(
      service.execute(request, async () => {
        throw new Error('temporary failure');
      }),
    ).rejects.toThrow('temporary failure');

    await expect(
      service.execute(request, async () => ({ id: 'application-2' })),
    ).resolves.toEqual({
      value: { id: 'application-2' },
      idempotent: false,
    });
  });
});

import { createLogger } from '@nocobase/logging';
import { createQueueManager, createSyncQueueConfig } from '@nocobase/queue';
import type { DatabaseManager } from '@nocobase/db';
import { describe, expect, it, vi } from 'vitest';

import { createNotificationManager } from '../server/manager.js';
import type {
  NotificationAttemptRecord,
  NotificationDeliveryRecord,
} from '../server/store.js';
import type {
  NotificationProviderCapabilities,
  NotificationProviderSendInput,
  ProviderSendResult,
} from '../server/types.js';
import { FakeNotificationStore } from './helpers/fake-notification-store.js';

describe('NotificationManager delivery lifecycle', () => {
  it('deduplicates repeated sends and rejects reuse with different content', async () => {
    const send = vi.fn(async () => ({ status: 'accepted' }) as const);
    const { manager, queue } = createEmailManagerHarness({ send });
    const input = {
      idempotencyKey: 'order-won:42:user-7:email',
      messages: { email: { title: 'Order won', body: 'Order 42 was won.' } },
    };

    const first = await manager.send(input);
    const repeated = await manager.send(input);

    expect(first.deduplicated).toBe(false);
    expect(repeated).toMatchObject({
      notificationId: first.notificationId,
      idempotencyKey: input.idempotencyKey,
      deduplicated: true,
      status: 'completed',
    });
    expect(send).toHaveBeenCalledOnce();
    await expect(
      manager.getByIdempotencyKey(input.idempotencyKey),
    ).resolves.toMatchObject({
      notificationId: first.notificationId,
      terminal: true,
      summary: { accepted: 1 },
    });
    await expect(
      manager.send({
        ...input,
        messages: { email: { title: 'Order won', body: 'Different body.' } },
      }),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_CONFLICT' });

    await manager.close();
    await queue.close();
  });

  it('derives a self-consistent status snapshot from one Delivery read', async () => {
    const store = new StaleLogStatusNotificationStore();
    const { manager, queue } = createEmailManagerHarness({
      store,
      send: async () => ({ status: 'accepted' }),
    });

    const sent = await manager.send({
      idempotencyKey: 'consistent-status-snapshot-1',
      messages: { email: { body: 'Consistent status.' } },
    });

    await expect(
      manager.getNotification(sent.notificationId),
    ).resolves.toMatchObject({
      status: 'completed',
      terminal: true,
      summary: { accepted: 1, pending: 0 },
      deliveries: [{ status: 'accepted' }],
    });

    await manager.close();
    await queue.close();
  });

  it('emits process-local status events without awaiting listener work', async () => {
    const { manager, queue } = createEmailManagerHarness({
      send: async () => ({ status: 'accepted' }),
    });
    const listener = vi.fn(async () => new Promise<void>(() => undefined));
    const unsubscribe = manager.onStatusChanged(
      { idempotencyKey: 'status-event-1' },
      listener,
    );

    const result = await manager.send({
      idempotencyKey: 'status-event-1',
      messages: { email: { body: 'Status event.' } },
    });
    await vi.waitFor(() => expect(listener).toHaveBeenCalled());

    expect(result.status).toBe('completed');
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: 'status-event-1',
        notificationId: result.notificationId,
      }),
    );
    unsubscribe();
    await manager.close();
    await queue.close();
  });

  it('does not emit an older status snapshot after a newer one', async () => {
    const store = new DelayedLogNotificationStore();
    const send = vi
      .fn<
        (input: NotificationProviderSendInput) => Promise<ProviderSendResult>
      >()
      .mockResolvedValueOnce({
        status: 'failed',
        disposition: 'never',
        error: { message: 'rejected', category: 'provider' },
      })
      .mockResolvedValueOnce({ status: 'accepted' });
    const { manager, queue } = createEmailManagerHarness({ send, store });
    const sent = await manager.send({
      idempotencyKey: 'status-event-order-1',
      messages: { email: { body: 'Ordered status event.' } },
    });
    const gate = store.delayNextLogRead();
    const statuses: string[] = [];
    const unsubscribe = manager.onStatusChanged(
      { notificationId: sent.notificationId },
      (event) => {
        statuses.push(event.status);
      },
    );
    await gate.captured;

    await manager.retryDelivery({
      deliveryId: sent.deliveries[0]!.id,
      reason: 'Retry after correcting the terminal failure.',
    });
    await vi.waitFor(() => expect(statuses).toContain('completed'));
    gate.release();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(statuses.at(-1)).toBe('completed');
    unsubscribe();
    await manager.close();
    await queue.close();
  });

  it('retries terminal failed Deliveries and records the retry resolution', async () => {
    const send = vi
      .fn<
        (input: NotificationProviderSendInput) => Promise<ProviderSendResult>
      >()
      .mockResolvedValueOnce({
        status: 'failed',
        disposition: 'never',
        error: { message: 'rejected', category: 'provider' },
      })
      .mockResolvedValueOnce({ status: 'accepted' });
    const { manager, queue, store } = createEmailManagerHarness({ send });
    const sent = await manager.send({
      idempotencyKey: 'retry-failed-1',
      messages: { email: { body: 'Retry failure.' } },
    });

    expect(sent.deliveries[0]).toMatchObject({
      status: 'failed',
      retry: { allowed: true, mode: 'safe' },
    });
    await expect(
      manager.retryDelivery({
        deliveryId: sent.deliveries[0]!.id,
        reason: '   ',
      }),
    ).rejects.toMatchObject({
      code: 'NOTIFICATION_DELIVERY_RETRY_NOT_ALLOWED',
      message: expect.stringContaining('reason'),
    });
    await expect(
      manager.retryDelivery({
        deliveryId: sent.deliveries[0]!.id,
        reason: 'Retry after correcting the terminal failure.',
      }),
    ).resolves.toMatchObject({ status: 'accepted', attemptCount: 2 });
    await expect(
      store.listAttempts(sent.deliveries[0]!.id),
    ).resolves.toMatchObject([
      { sequence: 1, retryResolution: undefined },
      {
        sequence: 2,
        retryResolution: { type: 'terminal_failure' },
      },
    ]);

    await manager.close();
    await queue.close();
  });

  it('requires a reason before retrying an unsafe unknown Delivery', async () => {
    const send = vi
      .fn<
        (input: NotificationProviderSendInput) => Promise<ProviderSendResult>
      >()
      .mockResolvedValueOnce({
        status: 'submission_unknown',
        error: { message: 'connection lost', category: 'network' },
      })
      .mockResolvedValueOnce({ status: 'accepted' });
    const { manager, queue, store } = createEmailManagerHarness({ send });
    const sent = await manager.send({
      idempotencyKey: 'retry-unknown-unsafe-1',
      messages: { email: { body: 'Unknown result.' } },
    });
    const deliveryId = sent.deliveries[0]!.id;

    expect(sent.deliveries[0]).toMatchObject({
      status: 'unknown',
      retry: {
        allowed: true,
        mode: 'duplicate_risk_confirmation_required',
      },
    });
    await expect(
      manager.retryDelivery({ deliveryId, reason: '   ' }),
    ).rejects.toMatchObject({
      code: 'NOTIFICATION_DELIVERY_RETRY_NOT_ALLOWED',
    });
    await expect(
      manager.retryDelivery({
        deliveryId,
        reason:
          'The business owner prefers a possible duplicate to an omission.',
      }),
    ).resolves.toMatchObject({ status: 'accepted', attemptCount: 2 });
    await expect(store.listAttempts(deliveryId)).resolves.toMatchObject([
      { sequence: 1 },
      {
        sequence: 2,
        retryResolution: { type: 'duplicate_risk_accepted' },
      },
    ]);

    await manager.close();
    await queue.close();
  });

  it('safely retries an unknown Delivery when the Provider reuses deliveryId', async () => {
    const send = vi
      .fn<
        (input: NotificationProviderSendInput) => Promise<ProviderSendResult>
      >()
      .mockResolvedValueOnce({
        status: 'submission_unknown',
        error: { message: 'response lost', category: 'network' },
      })
      .mockResolvedValueOnce({ status: 'accepted' });
    const capabilities = {
      idempotency: { supported: true },
    } as const satisfies NotificationProviderCapabilities;
    const { manager, queue } = createEmailManagerHarness({
      send,
      capabilities,
    });
    const sent = await manager.send({
      idempotencyKey: 'retry-unknown-safe-1',
      messages: {
        email: { body: 'Unknown result with Provider idempotency.' },
      },
    });
    const deliveryId = sent.deliveries[0]!.id;

    expect(sent.deliveries[0]?.retry).toMatchObject({
      allowed: true,
      mode: 'safe',
    });
    await expect(
      manager.retryDelivery({
        deliveryId,
        reason: 'Retry within the Provider idempotency window.',
      }),
    ).resolves.toMatchObject({ status: 'accepted' });
    expect(send.mock.calls.map(([input]) => input.deliveryId)).toEqual([
      deliveryId,
      deliveryId,
    ]);

    await manager.close();
    await queue.close();
  });

  it('does not extend a bounded Provider idempotency window on each retry', async () => {
    const store = new ControlledNowNotificationStore(
      '2026-09-01T00:00:00.000Z',
    );
    const send = vi
      .fn<
        (input: NotificationProviderSendInput) => Promise<ProviderSendResult>
      >()
      .mockResolvedValue({
        status: 'submission_unknown',
        error: { message: 'response lost', category: 'network' },
      });
    const { manager, queue } = createEmailManagerHarness({
      send,
      store,
      capabilities: {
        idempotency: {
          supported: true,
          retentionMs: 24 * 60 * 60 * 1_000,
        },
      },
    });
    const sent = await manager.send({
      idempotencyKey: 'retry-unknown-bounded-window-1',
      messages: { email: { body: 'Bounded Provider idempotency.' } },
    });
    const deliveryId = sent.deliveries[0]!.id;

    store.setNow('2026-09-01T23:00:00.000Z');
    await expect(
      manager.retryDelivery({
        deliveryId,
        reason: 'Retry within the Provider idempotency window.',
      }),
    ).resolves.toMatchObject({ status: 'unknown', attemptCount: 2 });
    store.setNow('2026-09-02T01:00:00.000Z');

    await expect(
      manager.getNotification(sent.notificationId),
    ).resolves.toMatchObject({
      deliveries: [
        {
          retry: {
            allowed: true,
            mode: 'duplicate_risk_confirmation_required',
          },
        },
      ],
    });
    expect(send).toHaveBeenCalledTimes(2);

    await manager.close();
    await queue.close();
  });

  it('submits an accepted-risk retry when its Provider idempotency window expires during preparation', async () => {
    const store = new ControlledNowNotificationStore(
      '2026-09-01T00:00:00.000Z',
    );
    const send = vi
      .fn<
        (input: NotificationProviderSendInput) => Promise<ProviderSendResult>
      >()
      .mockResolvedValueOnce({
        status: 'submission_unknown',
        error: { message: 'response lost', category: 'network' },
      })
      .mockResolvedValueOnce({ status: 'accepted' });
    let prepareCount = 0;
    const { manager, queue } = createEmailManagerHarness({
      send,
      store,
      prepare(message) {
        prepareCount += 1;
        if (prepareCount === 2) store.setNow('2026-09-01T00:00:01.100Z');
        return message;
      },
      capabilities: {
        idempotency: {
          supported: true,
          retentionMs: 1_000,
        },
      },
    });
    const sent = await manager.send({
      idempotencyKey: 'retry-unknown-expired-during-preparation-1',
      messages: { email: { body: 'Slow preparation.' } },
    });
    const deliveryId = sent.deliveries[0]!.id;
    store.setNow('2026-09-01T00:00:00.900Z');

    await expect(
      manager.retryDelivery({
        deliveryId,
        reason: 'Retry while the Provider idempotency window is active.',
      }),
    ).resolves.toMatchObject({
      status: 'accepted',
      attemptCount: 2,
    });
    expect(send).toHaveBeenCalledTimes(2);
    await expect(store.listAttempts(deliveryId)).resolves.toMatchObject([
      { sequence: 1, retryResolution: undefined },
      {
        sequence: 2,
        retryResolution: { type: 'duplicate_risk_accepted' },
      },
    ]);
    await expect(store.listRetryAudits(deliveryId)).resolves.toMatchObject([
      {
        resolution: { type: 'safe_provider_idempotency' },
        providerIdempotency: {
          startedAt: '2026-09-01T00:00:00.000Z',
          expiresAt: '2026-09-01T00:00:01.000Z',
        },
      },
    ]);

    await manager.close();
    await queue.close();
  });

  it('rechecks Provider idempotency after persisting the retry Attempt', async () => {
    const store = new ExpiringStartAttemptNotificationStore(
      '2026-09-01T00:00:00.000Z',
      '2026-09-01T00:00:01.100Z',
    );
    const send = vi
      .fn<
        (input: NotificationProviderSendInput) => Promise<ProviderSendResult>
      >()
      .mockResolvedValueOnce({
        status: 'submission_unknown',
        error: { message: 'response lost', category: 'network' },
      })
      .mockResolvedValueOnce({ status: 'accepted' });
    const { manager, queue } = createEmailManagerHarness({
      send,
      store,
      capabilities: {
        idempotency: {
          supported: true,
          retentionMs: 1_000,
        },
      },
    });
    const sent = await manager.send({
      idempotencyKey: 'retry-unknown-expired-during-attempt-start-1',
      messages: { email: { body: 'Slow persistence.' } },
    });
    const deliveryId = sent.deliveries[0]!.id;
    store.setNow('2026-09-01T00:00:00.900Z');

    await expect(
      manager.retryDelivery({
        deliveryId,
        reason: 'Retry while the Provider idempotency window is active.',
      }),
    ).resolves.toMatchObject({ status: 'accepted', attemptCount: 2 });
    expect(send).toHaveBeenCalledTimes(2);
    await expect(store.listAttempts(deliveryId)).resolves.toMatchObject([
      { sequence: 1, retryResolution: undefined },
      {
        sequence: 2,
        retryResolution: { type: 'duplicate_risk_accepted' },
      },
    ]);
    await expect(store.listRetryAudits(deliveryId)).resolves.toMatchObject([
      { resolution: { type: 'safe_provider_idempotency' } },
    ]);

    await manager.close();
    await queue.close();
  });

  it('does not infer idempotency for an old unknown attempt from new Provider capabilities', async () => {
    const store = new FakeNotificationStore();
    const firstSend = vi.fn(async (): Promise<ProviderSendResult> => ({
      status: 'submission_unknown',
      error: { message: 'response lost', category: 'network' },
    }));
    const first = createEmailManagerHarness({ send: firstSend, store });
    const sent = await first.manager.send({
      idempotencyKey: 'retry-unknown-capability-upgrade-1',
      messages: { email: { body: 'Capability changes after submission.' } },
    });
    await first.manager.close();
    await first.queue.close();

    const upgradedSend = vi.fn(async (): Promise<ProviderSendResult> => ({
      status: 'accepted',
    }));
    const upgraded = createEmailManagerHarness({
      send: upgradedSend,
      store,
      capabilities: {
        idempotency: { supported: true },
      },
    });

    await expect(
      upgraded.manager.getNotification(sent.notificationId),
    ).resolves.toMatchObject({
      deliveries: [
        {
          retry: {
            allowed: true,
            mode: 'duplicate_risk_confirmation_required',
          },
        },
      ],
    });
    expect(upgradedSend).not.toHaveBeenCalled();

    await upgraded.manager.close();
    await upgraded.queue.close();
  });

  it('does not use persisted idempotency evidence after the Provider drops that capability', async () => {
    const store = new FakeNotificationStore();
    const first = createEmailManagerHarness({
      store,
      send: async () => ({
        status: 'submission_unknown',
        error: { message: 'response lost', category: 'network' },
      }),
      capabilities: {
        idempotency: { supported: true },
      },
    });
    const sent = await first.manager.send({
      idempotencyKey: 'retry-unknown-capability-removed-1',
      messages: { email: { body: 'Capability removed after submission.' } },
    });
    await first.manager.close();
    await first.queue.close();

    const currentSend = vi.fn(async (): Promise<ProviderSendResult> => ({
      status: 'accepted',
    }));
    const current = createEmailManagerHarness({ send: currentSend, store });

    await expect(
      current.manager.getNotification(sent.notificationId),
    ).resolves.toMatchObject({
      deliveries: [
        {
          retry: {
            allowed: true,
            mode: 'duplicate_risk_confirmation_required',
          },
        },
      ],
    });
    expect(currentSend).not.toHaveBeenCalled();

    await current.manager.close();
    await current.queue.close();
  });
});

function createEmailManagerHarness(input: {
  readonly send: (
    input: NotificationProviderSendInput,
  ) => Promise<ProviderSendResult>;
  readonly capabilities?: NotificationProviderCapabilities;
  readonly store?: FakeNotificationStore;
  readonly prepare?: (message: object) => object | Promise<object>;
}) {
  const queue = createQueueManager(createSyncQueueConfig());
  const store = input.store ?? new FakeNotificationStore();
  const manager = createNotificationManager({
    database: {} as DatabaseManager,
    queue,
    logger: createLogger({ level: 'silent' }),
    config: {
      channels: { email: { provider: 'fake' } },
    },
    store,
  });
  manager.registry
    .registerChannel({
      type: 'email',
      async createChannel() {
        return {
          type: 'email',
          validateMessage(message: object) {
            return { message, recipients: [{ address: 'buyer@example.com' }] };
          },
          async prepare({ message }): Promise<object> {
            return input.prepare ? input.prepare(message) : message;
          },
        };
      },
    })
    .registerProvider({
      type: 'fake',
      messageType: 'email',
      capabilities: input.capabilities,
      async createProvider(_context, config) {
        return {
          type: config.provider,
          capabilities: input.capabilities,
          send: input.send,
        };
      },
    });
  return { manager, queue, store };
}

class ControlledNowNotificationStore extends FakeNotificationStore {
  constructor(private currentTime: string) {
    super();
  }

  setNow(value: string): void {
    this.currentTime = value;
  }

  override async now(): Promise<string> {
    return this.currentTime;
  }
}

class ExpiringStartAttemptNotificationStore extends ControlledNowNotificationStore {
  constructor(
    currentTime: string,
    private readonly expiresAfterStart: string,
  ) {
    super(currentTime);
  }

  override async startAttempt(
    delivery: NotificationDeliveryRecord,
    attempt: NotificationAttemptRecord,
    leaseExpiresAt: string,
  ): Promise<NotificationDeliveryRecord | undefined> {
    const started = await super.startAttempt(delivery, attempt, leaseExpiresAt);
    if (attempt.sequence === 2) this.setNow(this.expiresAfterStart);
    return started;
  }
}

class DelayedLogNotificationStore extends FakeNotificationStore {
  private nextLogRead?: {
    readonly captured: () => void;
    readonly released: Promise<void>;
  };

  delayNextLogRead(): {
    readonly captured: Promise<void>;
    readonly release: () => void;
  } {
    let capture!: () => void;
    let release!: () => void;
    const captured = new Promise<void>((resolve) => {
      capture = resolve;
    });
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.nextLogRead = { captured: capture, released };
    return { captured, release };
  }

  override async getLog(id: string) {
    const gate = this.nextLogRead;
    if (gate) this.nextLogRead = undefined;
    const snapshot = await super.getLog(id);
    if (gate) {
      gate.captured();
      await gate.released;
    }
    return snapshot;
  }
}

class StaleLogStatusNotificationStore extends FakeNotificationStore {
  override async getLog(id: string) {
    const log = await super.getLog(id);
    return log ? { ...log, status: 'pending' as const } : undefined;
  }
}

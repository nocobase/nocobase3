import { once } from 'node:events';
import { createServer, type AddressInfo } from 'node:http';
import type {
  NotificationProviderContext,
  NotificationProviderSendInput,
} from '@nocobase/app-plugin-notification';
import { afterEach, expect, it, vi } from 'vitest';

import {
  createResendProviderDefinition,
  defineResendProviderConfig,
} from '../server/email/providers/resend.js';
import type { PreparedEmailMessage } from '../server/email/types.js';

interface CapturedRequest {
  readonly authorization?: string;
  readonly idempotencyKey?: string;
  readonly method?: string;
  readonly path?: string;
  readonly body: unknown;
}

afterEach(() => vi.unstubAllEnvs());

it('sends the mapped message through the Resend SDK to a local HTTP service', async () => {
  const requests: CapturedRequest[] = [];
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer | string) =>
      chunks.push(Buffer.from(chunk)),
    );
    request.on('end', () => {
      requests.push({
        authorization: request.headers.authorization,
        idempotencyKey: request.headers['idempotency-key'],
        method: request.method,
        path: request.url,
        body: JSON.parse(Buffer.concat(chunks).toString('utf8')),
      });
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ id: 'local-resend-message-1' }));
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address() as AddressInfo;
  vi.stubEnv('RESEND_BASE_URL', `http://127.0.0.1:${address.port}`);

  try {
    const provider = await createResendProviderDefinition().createProvider(
      providerContext(),
      defineResendProviderConfig({
        apiKey: 're_test_local',
        from: 'NocoBase <notifications@example.com>',
        replyTo: 'support@example.com',
      }),
    );
    await expect(provider.send(sendInput())).resolves.toEqual({
      status: 'accepted',
      providerMessageId: 'local-resend-message-1',
    });

    expect(requests).toEqual([
      {
        authorization: 'Bearer re_test_local',
        idempotencyKey: 'delivery-1',
        method: 'POST',
        path: '/emails',
        body: {
          from: 'NocoBase <notifications@example.com>',
          to: 'alice@example.com',
          subject: 'Approval complete',
          text: 'Review the result.',
          replyTo: 'support@example.com',
        },
      },
    ]);
  } finally {
    server.close();
    await once(server, 'close');
  }
});

function providerContext(): NotificationProviderContext {
  return {
    logger: {} as NotificationProviderContext['logger'],
    async now(): Promise<string> {
      return '2026-09-30T00:00:00.000Z';
    },
  };
}

function sendInput(): NotificationProviderSendInput<PreparedEmailMessage> {
  return {
    notificationId: 'notification-1',
    deliveryId: 'delivery-1',
    attemptId: 'attempt-1',
    deadline: '2026-09-30T00:01:00.000Z',
    signal: new AbortController().signal,
    message: {
      to: 'alice@example.com',
      content: {
        subject: 'Approval complete',
        text: 'Review the result.',
      },
    },
  };
}

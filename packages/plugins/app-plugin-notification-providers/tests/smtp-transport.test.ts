import type {
  NotificationProviderContext,
  NotificationProviderSendInput,
} from '@nocobase/app-plugin-notification';
import { expect, it } from 'vitest';

import {
  createSmtpProviderDefinition,
  defineSmtpProviderConfig,
} from '../server/email/providers/smtp.js';
import type { PreparedEmailMessage } from '../server/email/types.js';
import { createFakeSmtpServer } from './helpers/fake-smtp-server.js';

it('sends a message through Nodemailer to a local SMTP server', async () => {
  const smtp = await createFakeSmtpServer();
  let closeProvider: (() => Promise<void>) | undefined;

  try {
    const provider = await createSmtpProviderDefinition().createProvider(
      providerContext(),
      defineSmtpProviderConfig({
        host: '127.0.0.1',
        port: smtp.port,
        secure: false,
        from: 'NocoBase <notifications@example.com>',
        replyTo: 'support@example.com',
      }),
    );
    closeProvider = async () => provider.close?.();
    await expect(provider.send(sendInput())).resolves.toMatchObject({
      status: 'accepted',
      providerMessageId: expect.any(String),
    });
    expect(smtp.messages).toHaveLength(1);
    expect(smtp.messages[0]).toContain(
      'From: NocoBase <notifications@example.com>',
    );
    expect(smtp.messages[0]).toContain('To: alice@example.com');
    expect(smtp.messages[0]).toContain('Subject: Approval complete');
    expect(smtp.messages[0]).toContain('Reply-To: support@example.com');
    expect(smtp.messages[0]).toContain('Review the result.');
  } finally {
    await closeProvider?.();
    await smtp.close();
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

import type {
  NotificationProvider,
  NotificationProviderContext,
  NotificationProviderSendInput,
} from '@nocobase/app-plugin-notification';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createSmtpProviderDefinition,
  defineSmtpProviderConfig,
} from '../server/email/providers/smtp.js';
import type { PreparedEmailMessage } from '../server/email/types.js';

const smtpMock = vi.hoisted(() => ({
  close: vi.fn(),
  sendMail: vi.fn(),
}));

vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(() => smtpMock),
  },
}));

describe('SMTP Provider', () => {
  beforeEach(() => {
    smtpMock.close.mockReset();
    smtpMock.sendMail.mockReset();
  });

  it('returns the SMTP message ID after acceptance', async () => {
    smtpMock.sendMail.mockResolvedValue({ messageId: 'smtp-message-1' });
    const provider = await createProvider();

    await expect(provider.send(sendInput())).resolves.toEqual({
      status: 'accepted',
      providerMessageId: 'smtp-message-1',
    });
    expect(smtpMock.sendMail).toHaveBeenCalledWith({
      from: 'NocoBase <notifications@example.com>',
      to: 'alice@example.com',
      subject: 'Approval complete',
      text: 'Review the result.',
      html: undefined,
      replyTo: 'support@example.com',
    });
  });

  it('maps authentication failures to a permanent stable error category', async () => {
    smtpMock.sendMail.mockRejectedValue(
      Object.assign(new Error('Invalid credentials'), { code: 'EAUTH' }),
    );
    const provider = await createProvider();

    await expect(provider.send(sendInput())).resolves.toEqual({
      status: 'failed',
      disposition: 'never',
      error: {
        code: 'EAUTH',
        category: 'authentication',
        message: 'Invalid credentials',
      },
    });
  });
});

async function createProvider(): Promise<
  NotificationProvider<PreparedEmailMessage>
> {
  return createSmtpProviderDefinition().createProvider(
    providerContext(),
    defineSmtpProviderConfig({
      name: 'primary',
      host: 'smtp.example.com',
      port: 587,
      from: 'NocoBase <notifications@example.com>',
      replyTo: 'support@example.com',
    }),
  );
}

function providerContext(): NotificationProviderContext {
  return {
    logger: {} as NotificationProviderContext['logger'],
    async now(): Promise<string> {
      return '2026-08-26T00:00:00.000Z';
    },
  };
}

function sendInput(): NotificationProviderSendInput<PreparedEmailMessage> {
  return {
    notificationId: 'notification-1',
    deliveryId: 'delivery-1',
    attemptId: 'attempt-1',
    deadline: '2026-08-26T00:01:00.000Z',
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

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

  it.each([
    [450, 'same_provider'],
    [550, 'never'],
  ] as const)(
    'maps SMTP %i envelope responses to the %s disposition',
    async (responseCode, disposition) => {
      smtpMock.sendMail.mockRejectedValue(
        Object.assign(new Error(`SMTP ${responseCode}`), {
          code: 'EENVELOPE',
          responseCode,
        }),
      );
      const provider = await createProvider();

      await expect(provider.send(sendInput())).resolves.toEqual({
        status: 'failed',
        disposition,
        error: {
          code: 'EENVELOPE',
          category: 'recipient',
          message: `SMTP ${responseCode}`,
        },
      });
    },
  );

  it('retries a connection timeout before SMTP submission', async () => {
    smtpMock.sendMail.mockRejectedValue(
      Object.assign(new Error('Connection timeout'), {
        code: 'ETIMEDOUT',
        command: 'CONN',
      }),
    );
    const provider = await createProvider();

    await expect(provider.send(sendInput())).resolves.toEqual({
      status: 'failed',
      disposition: 'same_provider',
      error: {
        code: 'ETIMEDOUT',
        category: 'network',
        message: 'Connection timeout',
      },
    });
  });

  it('keeps a timeout after SMTP submission as unknown', async () => {
    smtpMock.sendMail.mockRejectedValue(
      Object.assign(new Error('Response timeout'), {
        code: 'ETIMEDOUT',
        command: 'DATA',
      }),
    );
    const provider = await createProvider();

    await expect(provider.send(sendInput())).resolves.toEqual({
      status: 'submission_unknown',
      error: {
        code: 'ETIMEDOUT',
        category: 'timeout',
        message: 'Response timeout',
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

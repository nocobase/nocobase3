// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import { createEmailProviderRegistry, createFakeEmailProvider, createSmtpProvider } from '../../registry/notification/providers/index.ts';

const message = { messageId: '<notification-1@example.test>', to: 'user@example.test', subject: 'Hello', text: 'World' };

describe('notification email providers', () => {
  it('keeps provider configuration identity separate from adapter behavior', () => {
    const provider = createFakeEmailProvider({ instanceId: 'email/fake/test' });
    const registry = createEmailProviderRegistry([{ id: provider.instanceId, enabled: true, provider }]);
    expect(registry.get('email/fake/test')?.provider).toBe(provider);
    expect(() => createEmailProviderRegistry([{ id: 'different', enabled: true, provider }])).toThrow('Invalid or duplicate');
  });

  it('returns accepted only after SMTP accepts the recipient and redacts its response', async () => {
    const provider = createSmtpProvider({ instanceId: 'email/smtp/primary', configRevision: 'revision-1', client: {
      verify: vi.fn(async () => undefined), close: vi.fn(),
      sendMail: vi.fn(async () => ({ accepted: [message.to], messageId: message.messageId, response: `250 queued for ${message.to}` })),
    } });
    await expect(provider.send(message)).resolves.toEqual({ status: 'accepted', providerMessageId: message.messageId, metadata: { response: '250 queued for [redacted-email]' } });
  });

  it.each([
    [{ code: 'EAUTH' }, { status: 'failed', error: { category: 'authentication', retryable: false, allowFallback: true } }],
    [{ code: 'ETIMEDOUT' }, { status: 'failed', error: { category: 'timeout', retryable: true, allowFallback: true } }],
    [{ code: 'EPIPE', submissionUnknown: true }, { status: 'submission_unknown', error: { code: 'SMTP_SUBMISSION_UNKNOWN' } }],
    [{ responseCode: 550, command: 'RCPT TO' }, { status: 'failed', error: { category: 'invalid_recipient', retryable: false, allowFallback: false } }],
  ])('normalizes SMTP error %o', async (failure, expected) => {
    const provider = createSmtpProvider({ instanceId: 'email/smtp/primary', configRevision: 'revision-1', client: {
      verify: vi.fn(async () => undefined), close: vi.fn(), sendMail: vi.fn(async () => { throw failure; }),
    } });
    await expect(provider.send(message)).resolves.toMatchObject(expected);
  });
});

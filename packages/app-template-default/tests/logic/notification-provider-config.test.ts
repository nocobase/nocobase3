// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import { createConfiguredEmailProviders } from '../../registry/notification/config/providers.ts';

describe('notification provider configuration', () => {
  it('resolves enabled SMTP credentials without exposing them through the registry', async () => {
    const createSmtpClient = vi.fn(() => ({ verify: async () => undefined, sendMail: async () => ({ accepted: [] }), close: () => undefined }));
    const registry = await createConfiguredEmailProviders({ production: true, definitions: [{ id: 'email/smtp/primary', type: 'smtp', enabled: true, host: 'smtp.example.test', port: 465, secure: true, usernameSecret: 'SMTP_USER', passwordSecret: 'SMTP_PASSWORD' }], resolveSecret: async (reference) => ({ SMTP_USER: 'mailer', SMTP_PASSWORD: 'secret-value' })[reference], createSmtpClient });

    expect(createSmtpClient).toHaveBeenCalledWith(expect.objectContaining({ username: 'mailer', password: 'secret-value' }));
    expect(JSON.stringify(registry.list())).not.toContain('secret-value');
    expect(registry.list()[0]).toMatchObject({ id: 'email/smtp/primary', provider: { configRevision: expect.any(String) } });
  });

  it('does not resolve Secrets for disabled instances', async () => {
    const resolveSecret = vi.fn(async () => undefined);
    const registry = await createConfiguredEmailProviders({ production: true, definitions: [{ id: 'email/smtp/disabled', type: 'smtp', enabled: false, host: 'smtp.example.test', port: 25, secure: false, passwordSecret: 'MISSING' }], resolveSecret, createSmtpClient: vi.fn() });
    expect(registry.list()).toEqual([]);
    expect(resolveSecret).not.toHaveBeenCalled();
  });

  it('rejects missing enabled Secrets and production Fake providers', async () => {
    const base = { resolveSecret: async () => undefined, createSmtpClient: vi.fn() };
    await expect(createConfiguredEmailProviders({ ...base, production: true, definitions: [{ id: 'email/smtp/primary', type: 'smtp', enabled: true, host: 'smtp.example.test', port: 25, secure: false, passwordSecret: 'MISSING' }] })).rejects.toThrow('Secret');
    await expect(createConfiguredEmailProviders({ ...base, production: true, definitions: [{ id: 'email/fake/test', type: 'fake', enabled: true }] })).rejects.toThrow('not allowed in production');
  });
});

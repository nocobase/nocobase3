// @vitest-environment node

import type { AddressInfo } from 'node:net';
import { SMTPServer } from 'smtp-server';
import { afterEach, describe, expect, it } from 'vitest';
import { createNodemailerSmtpClient, createSmtpProvider } from '../../registry/notification/providers/index.ts';

const servers: SMTPServer[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

describe('local SMTP provider', () => {
  it('reports accepted only after a local SMTP server accepts DATA', async () => {
    const messages: string[] = [];
    const server = new SMTPServer({ authOptional: true, disabledCommands: ['STARTTLS'], onData(stream, _session, callback) {
      let body = '';
      stream.setEncoding('utf8');
      stream.on('data', (chunk: string) => { body += chunk; });
      stream.on('end', () => { messages.push(body); callback(undefined, 'queued-local-1'); });
    } });
    servers.push(server);
    await new Promise<void>((resolve, reject) => server.listen(0, '127.0.0.1', (error?: Error) => error ? reject(error) : resolve()));
    const port = (server.server.address() as AddressInfo).port;
    const provider = createSmtpProvider({ instanceId: 'email/smtp/local', configRevision: 'local-v1', client: createNodemailerSmtpClient({ host: '127.0.0.1', port, secure: false }) });

    await provider.checkConnection();
    await expect(provider.send({ messageId: '<local-1@example.test>', to: 'user@example.test', subject: 'Local test', text: 'Delivered to local SMTP' })).resolves.toMatchObject({ status: 'accepted', providerMessageId: '<local-1@example.test>' });
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('Delivered to local SMTP');
    await provider.close();
  });
});

import nodemailer from 'nodemailer';

import type { SmtpClientConfig } from '../config/providers.js';
import type { EmailProviderMessage } from './types.js';
import type { SmtpClient, SmtpSendResponse } from './smtp.js';

export function createNodemailerSmtpClient(config: SmtpClientConfig): SmtpClient {
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.username || config.password ? { user: config.username, pass: config.password } : undefined,
  });
  return {
    verify: async (): Promise<void> => { await transport.verify(); },
    async sendMail(message: EmailProviderMessage): Promise<SmtpSendResponse> {
      try {
        const result = await transport.sendMail({ from: 'notifications@localhost', to: message.to, subject: message.subject, text: message.text, html: message.html, messageId: message.messageId });
        return { accepted: result.accepted.map(String), rejected: result.rejected.map(String), response: result.response, messageId: result.messageId };
      } catch (error) {
        if (error && typeof error === 'object' && (error as { command?: unknown }).command === 'DATA') {
          Object.assign(error, { submissionUnknown: true });
        }
        throw error;
      }
    },
    close: (): void => { transport.close(); },
  };
}

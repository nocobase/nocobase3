import type {
  NotificationProviderDefinition,
  ProviderSendResult,
} from '@nocobase/notification';
import nodemailer from 'nodemailer';

import type { EmailMessage, SmtpProviderConfig } from '../types.js';

export function defineSmtpProviderConfig(
  input: Omit<SmtpProviderConfig, 'type'>,
): SmtpProviderConfig {
  return { type: 'smtp', ...input };
}

export function createSmtpProviderDefinition(): NotificationProviderDefinition<SmtpProviderConfig> {
  return {
    type: 'smtp',
    async createProvider(_context, config) {
      const transporter = nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        auth: config.auth,
      });
      return {
        name: config.name,
        type: 'smtp',
        async send(message: object): Promise<ProviderSendResult> {
          const value = message as {
            readonly to: string;
            readonly content: EmailMessage;
          };
          try {
            await transporter.sendMail({
              from: value.content.from ?? config.from,
              to: value.to,
              subject: value.content.subject,
              text: value.content.text,
              html: value.content.html,
            });
            return { status: 'accepted' };
          } catch (error) {
            if (isUnknownSubmission(error)) {
              return {
                status: 'submission_unknown',
                error: {
                  category: 'provider',
                  message: error.message,
                },
              };
            }
            return {
              status: 'failed',
              error: {
                category: 'provider',
                message: error instanceof Error ? error.message : String(error),
              },
              allowNextProvider: true,
            };
          }
        },
        async close(): Promise<void> {
          transporter.close();
        },
      };
    },
  };
}

function isUnknownSubmission(error: unknown): error is Error {
  if (!(error instanceof Error)) return false;
  const code =
    'code' in error && typeof error.code === 'string' ? error.code : undefined;
  return code === 'ETIMEDOUT' || code === 'ECONNRESET' || code === 'EPIPE';
}

import type {
  NotificationProviderDefinition,
  ProviderSendResult,
} from '@nocobase/notification';
import nodemailer from 'nodemailer';

import type { PreparedEmailMessage, SmtpProviderConfig } from '../types.js';

export function defineSmtpProviderConfig(
  input: Omit<SmtpProviderConfig, 'type'>,
): SmtpProviderConfig {
  return { type: 'smtp', ...input };
}

export function createSmtpProviderDefinition(): NotificationProviderDefinition<
  SmtpProviderConfig,
  PreparedEmailMessage
> {
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
        async send({ message }): Promise<ProviderSendResult> {
          try {
            await transporter.sendMail({
              from: message.content.from ?? config.from,
              to: message.to,
              subject: message.content.subject,
              text: message.content.text,
              html: message.content.html,
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
              disposition: smtpDisposition(error),
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

function smtpDisposition(error: unknown): 'never' | 'same_provider' {
  const code =
    error && typeof error === 'object' && 'code' in error
      ? String(error.code)
      : undefined;
  if (code === 'EAUTH' || code === 'EENVELOPE' || code === 'EMESSAGE')
    return 'never';
  if (
    code === 'ECONNREFUSED' ||
    code === 'ENOTFOUND' ||
    code === 'EAI_AGAIN' ||
    code === 'ESOCKET'
  )
    return 'same_provider';
  return 'never';
}

function isUnknownSubmission(error: unknown): error is Error {
  if (!(error instanceof Error)) return false;
  const code =
    'code' in error && typeof error.code === 'string' ? error.code : undefined;
  return code === 'ETIMEDOUT' || code === 'ECONNRESET' || code === 'EPIPE';
}

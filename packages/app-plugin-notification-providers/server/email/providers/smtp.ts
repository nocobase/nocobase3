import type {
  NotificationProviderDefinition,
  ProviderSendResult,
} from '@nocobase/app-plugin-notification';

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
      const { default: nodemailer } = await import('nodemailer');
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
            const info = await transporter.sendMail({
              from: message.content.from ?? config.from,
              to: message.to,
              subject: message.content.subject,
              text: message.content.text,
              html: message.content.html,
              replyTo: message.content.replyTo ?? config.replyTo,
            });
            return {
              status: 'accepted',
              providerMessageId: info.messageId,
            };
          } catch (error) {
            if (isUnknownSubmission(error)) {
              return {
                status: 'submission_unknown',
                error: {
                  category: 'timeout',
                  code: smtpErrorCode(error),
                  message: error.message,
                },
              };
            }
            return {
              status: 'failed',
              error: {
                category: smtpErrorCategory(error),
                code: smtpErrorCode(error),
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
  const responseCode = smtpResponseCode(error);
  if (responseCode !== undefined) {
    if (responseCode >= 400 && responseCode < 500) return 'same_provider';
    if (responseCode >= 500 && responseCode < 600) return 'never';
  }
  const code = smtpErrorCode(error);
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

function smtpErrorCategory(
  error: unknown,
): 'authentication' | 'content' | 'network' | 'provider' | 'recipient' {
  const code = smtpErrorCode(error);
  if (code === 'EAUTH') return 'authentication';
  if (code === 'EENVELOPE') return 'recipient';
  if (code === 'EMESSAGE') return 'content';
  if (
    code === 'ECONNREFUSED' ||
    code === 'ENOTFOUND' ||
    code === 'EAI_AGAIN' ||
    code === 'ESOCKET'
  )
    return 'network';
  return 'provider';
}

function smtpErrorCode(error: unknown): string | undefined {
  return error && typeof error === 'object' && 'code' in error
    ? String(error.code)
    : undefined;
}

function smtpResponseCode(error: unknown): number | undefined {
  if (!error || typeof error !== 'object' || !('responseCode' in error))
    return undefined;
  return typeof error.responseCode === 'number'
    ? error.responseCode
    : undefined;
}

function isUnknownSubmission(error: unknown): error is Error {
  if (!(error instanceof Error)) return false;
  const code =
    'code' in error && typeof error.code === 'string' ? error.code : undefined;
  return code === 'ETIMEDOUT' || code === 'ECONNRESET' || code === 'EPIPE';
}

import type { EmailProvider, EmailProviderMessage, ProviderSendResult } from './types.js';

export interface SmtpSendResponse {
  readonly accepted: readonly string[];
  readonly rejected?: readonly string[];
  readonly response?: string;
  readonly messageId?: string;
}

export interface SmtpClient {
  verify(): Promise<void>;
  sendMail(message: EmailProviderMessage): Promise<SmtpSendResponse>;
  close(): void;
}

export interface SmtpProviderOptions {
  readonly instanceId: string;
  readonly configRevision: string;
  readonly client: SmtpClient;
  readonly classifyError?: (error: unknown) => ProviderSendResult;
}

export function createSmtpProvider(options: SmtpProviderOptions): EmailProvider {
  return {
    instanceId: options.instanceId,
    providerType: 'smtp',
    configRevision: options.configRevision,
    checkConnection: (): Promise<void> => options.client.verify(),
    async send(message): Promise<ProviderSendResult> {
      try {
        const response = await options.client.sendMail(message);
        if (!response.accepted.includes(message.to)) {
          return { status: 'failed', error: { category: 'invalid_recipient', code: 'SMTP_RECIPIENT_REJECTED', message: 'SMTP rejected the recipient.', retryable: false, allowFallback: false } };
        }
        return { status: 'accepted', providerMessageId: response.messageId ?? message.messageId, metadata: response.response ? { response: redactSmtpResponse(response.response) } : undefined };
      } catch (error) {
        return options.classifyError?.(error) ?? classifySmtpError(error);
      }
    },
    async close(): Promise<void> { options.client.close(); },
  };
}

export function classifySmtpError(error: unknown): ProviderSendResult {
  const record = error && typeof error === 'object' ? error as Record<string, unknown> : {};
  const code = typeof record.code === 'string' ? record.code : 'SMTP_INTERNAL';
  const command = typeof record.command === 'string' ? record.command : undefined;
  const responseCode = typeof record.responseCode === 'number' ? record.responseCode : undefined;
  if (record.submissionUnknown === true) return { status: 'submission_unknown', error: { category: 'network', code: 'SMTP_SUBMISSION_UNKNOWN', message: 'SMTP submission outcome is unknown.' } };
  if (code === 'EAUTH') return { status: 'failed', error: { category: 'authentication', code, message: 'SMTP authentication failed.', retryable: false, allowFallback: true } };
  if (responseCode && responseCode >= 500) return { status: 'failed', error: { category: command === 'RCPT TO' ? 'invalid_recipient' : 'invalid_request', code: `SMTP_${responseCode}`, message: 'SMTP permanently rejected the request.', retryable: false, allowFallback: false } };
  if (code === 'ETIMEDOUT') return { status: 'failed', error: { category: 'timeout', code, message: 'SMTP timed out before submission completed.', retryable: true, allowFallback: true } };
  return { status: 'failed', error: { category: 'provider_unavailable', code, message: 'SMTP is temporarily unavailable.', retryable: true, allowFallback: true } };
}

function redactSmtpResponse(response: string): string {
  return response.replace(/[\w.+-]+@[\w.-]+/g, '[redacted-email]').slice(0, 500);
}

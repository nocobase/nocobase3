import type {
  NotificationProviderDefinition,
  NotificationProviderErrorCategory,
  ProviderSendResult,
} from '@nocobase/app-plugin-notification';
import type { ErrorResponse } from 'resend';

import { providerErrorCode } from '../../error.js';
import type { PreparedEmailMessage, ResendProviderConfig } from '../types.js';

export function defineResendProviderConfig(
  input: Omit<ResendProviderConfig, 'type'>,
): ResendProviderConfig {
  return { type: 'resend', ...input };
}

export function createResendProviderDefinition(): NotificationProviderDefinition<
  ResendProviderConfig,
  PreparedEmailMessage
> {
  return {
    type: 'resend',
    async createProvider(_context, config) {
      const { Resend } = await import('resend');
      const client = new Resend(config.apiKey);
      return {
        name: config.name,
        type: 'resend',
        async send({ deliveryId, message }): Promise<ProviderSendResult> {
          try {
            const result = await client.emails.send(
              {
                from: message.content.from ?? config.from,
                to: message.to,
                subject: message.content.subject,
                text: message.content.text,
                html: message.content.html,
                replyTo: message.content.replyTo ?? config.replyTo,
              },
              { idempotencyKey: deliveryId },
            );
            if (result.error) return resendFailure(result.error);
            return {
              status: 'accepted',
              providerMessageId: result.data.id,
            };
          } catch (error) {
            return thrownFailure(error);
          }
        },
      };
    },
  };
}

function resendFailure(error: ErrorResponse): ProviderSendResult {
  if (error.name === 'application_error' && error.statusCode === null) {
    return {
      status: 'submission_unknown',
      error: {
        code: error.name,
        category: 'network',
        message: error.message,
      },
    };
  }
  const category = resendErrorCategory(error);
  return {
    status: 'failed',
    disposition: resendDisposition(error),
    error: {
      code: error.name,
      category,
      message: error.message,
    },
  };
}

function resendErrorCategory(
  error: ErrorResponse,
): NotificationProviderErrorCategory {
  if (
    error.name === 'rate_limit_exceeded' ||
    error.name === 'monthly_quota_exceeded' ||
    error.name === 'daily_quota_exceeded'
  )
    return 'rate_limit';
  if (
    error.name === 'missing_api_key' ||
    error.name === 'restricted_api_key' ||
    error.name === 'invalid_api_key' ||
    error.name === 'invalid_access' ||
    error.name === 'security_error'
  )
    return 'authentication';
  if (error.name === 'invalid_from_address' || error.name === 'invalid_region')
    return 'configuration';
  if (
    error.name === 'application_error' ||
    error.name === 'internal_server_error'
  )
    return 'provider';
  if (
    error.name === 'validation_error' ||
    error.name === 'invalid_parameter' ||
    error.name === 'missing_required_field' ||
    error.name === 'invalid_attachment' ||
    error.name === 'invalid_idempotency_key' ||
    error.name === 'invalid_idempotent_request'
  )
    return 'content';
  return 'provider';
}

function resendDisposition(error: ErrorResponse): 'never' | 'same_provider' {
  if (error.statusCode === 429 || (error.statusCode ?? 0) >= 500)
    return 'same_provider';
  if (error.name === 'concurrent_idempotent_requests') return 'same_provider';
  return 'never';
}

function thrownFailure(error: unknown): ProviderSendResult {
  const message = error instanceof Error ? error.message : String(error);
  const code = providerErrorCode(error);
  if (code === 'ETIMEDOUT' || code === 'ECONNRESET' || code === 'EPIPE') {
    return {
      status: 'submission_unknown',
      error: { code, category: 'timeout', message },
    };
  }
  return {
    status: 'failed',
    disposition: 'same_provider',
    error: { code, category: 'network', message },
  };
}

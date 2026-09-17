import { queueServiceToken } from '@nocobase/app-server/queue';
import type { PublishReceipt } from '@nocobase/queue';
import type { ServiceContainer } from '@nocobase/service-provider';

export interface __NOCOBASE_SYMBOL_NAME__JobPayload {
  readonly requestedAt: string;
}

// Keep queue and channel identities stable across class and file renames.
export const __NOCOBASE_MODULE_NAME__Queue: string =
  __NOCOBASE_PACKAGE_NAME_LITERAL__;
export const __NOCOBASE_MODULE_NAME__Channel: string =
  __NOCOBASE_JOB_NAME_LITERAL__;

export class __NOCOBASE_SYMBOL_NAME__Handler {
  public async handle(
    channel: string,
    message: unknown,
    signal: AbortSignal,
  ): Promise<void> {
    if (channel !== __NOCOBASE_MODULE_NAME__Channel) return;
    signal.throwIfAborted();
    if (
      typeof message !== 'object' ||
      message === null ||
      !('requestedAt' in message) ||
      typeof message.requestedAt !== 'string' ||
      !message.requestedAt.trim()
    ) {
      throw new TypeError('Expected a nonempty requestedAt string');
    }
    // Call an idempotent domain operation here and pass its cancellation signal.
  }
}

export async function publish__NOCOBASE_SYMBOL_NAME__(
  container: ServiceContainer,
  payload: __NOCOBASE_SYMBOL_NAME__JobPayload,
): Promise<PublishReceipt> {
  const queue = container.resolve(queueServiceToken);
  return queue
    .producer(__NOCOBASE_MODULE_NAME__Queue)
    .publish(__NOCOBASE_MODULE_NAME__Channel, payload);
}

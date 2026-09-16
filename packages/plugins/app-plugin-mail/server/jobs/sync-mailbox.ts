import { Job, type JobOptions } from '@nocobase/queue';

import type { MailSyncMailboxTaskPayload } from '../types.js';

export const MAIL_SYNC_JOB_NAME = '@nocobase/app-plugin-mail/sync-mailbox';

export type MailSyncJobHandler = (
  payload: MailSyncMailboxTaskPayload,
) => Promise<void>;

const handlers = new Map<string, MailSyncJobHandler>();

export default class SyncMailboxJob extends Job<MailSyncMailboxTaskPayload> {
  public static options: JobOptions = {
    name: MAIL_SYNC_JOB_NAME,
    queue: 'mail',
  };

  public async execute(): Promise<void> {
    if (
      this.payload.version !== 1 ||
      typeof this.payload.syncRunId !== 'string' ||
      this.payload.syncRunId.length === 0 ||
      !Number.isSafeInteger(this.payload.expectedRevision) ||
      typeof this.payload.expectedPhase !== 'string'
    ) {
      throw new TypeError('Invalid mail sync Queue payload.');
    }
    const handler = handlers.get(this.context.queue);
    if (!handler) {
      throw new Error(
        `No mail sync runtime is listening on queue "${this.context.queue}".`,
      );
    }
    await handler(this.payload);
  }
}

export function registerMailSyncJobHandler(
  queueName: string,
  handler: MailSyncJobHandler,
): () => void {
  const existing = handlers.get(queueName);
  if (existing && existing !== handler) {
    throw new Error(
      `A mail sync runtime is already listening on queue "${queueName}".`,
    );
  }
  handlers.set(queueName, handler);
  return (): void => {
    if (handlers.get(queueName) === handler) handlers.delete(queueName);
  };
}

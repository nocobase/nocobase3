import { Job, type JobOptions } from '@nocobase/queue';

import type { MailScheduledSendTaskPayload } from '../types.js';

export const MAIL_SCHEDULED_SEND_JOB_NAME =
  '@nocobase/app-plugin-mail/send-scheduled-mail';

export type MailScheduledSendJobHandler = (
  payload: MailScheduledSendTaskPayload,
) => Promise<void>;

const handlers = new Map<string, MailScheduledSendJobHandler>();

export default class SendScheduledMailJob extends Job<MailScheduledSendTaskPayload> {
  public static options: JobOptions = {
    name: MAIL_SCHEDULED_SEND_JOB_NAME,
    queue: 'mail',
  };

  public async execute(): Promise<void> {
    if (
      this.payload.version !== 1 ||
      typeof this.payload.submissionId !== 'string' ||
      this.payload.submissionId.length === 0
    ) {
      throw new TypeError('Invalid scheduled mail Queue payload.');
    }
    const handler = handlers.get(this.context.queue);
    if (!handler) {
      throw new Error(
        `No scheduled mail runtime is listening on queue "${this.context.queue}".`,
      );
    }
    await handler(this.payload);
  }
}

export function registerMailScheduledSendJobHandler(
  queueName: string,
  handler: MailScheduledSendJobHandler,
): () => void {
  const existing = handlers.get(queueName);
  if (existing && existing !== handler) {
    throw new Error(
      `A scheduled mail runtime is already listening on queue "${queueName}".`,
    );
  }
  handlers.set(queueName, handler);
  return (): void => {
    if (handlers.get(queueName) === handler) handlers.delete(queueName);
  };
}

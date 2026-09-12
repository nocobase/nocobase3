import { Job, type JobOptions } from '@nocobase/queue';

export interface QueueExamplePayload {
  message: string;
  requestedAt: string;
}

export interface QueueExampleExecution extends QueueExamplePayload {
  executedAt: string;
}

export const queueExampleExecutions: QueueExampleExecution[] = [];

interface QueueExampleJobDependencies {
  logger: {
    info(data: Record<string, unknown>, message: string): void;
  };
}

export default class QueueExampleJob extends Job<QueueExamplePayload> {
  static options: JobOptions = {
    name: 'QueueExample',
    queue: 'default',
  };

  constructor(
    private readonly dependencies:
      QueueExampleJobDependencies | undefined = undefined,
  ) {
    super();
  }

  async execute(): Promise<void> {
    const executedAt = new Date().toISOString();

    this.dependencies?.logger.info(
      {
        jobId: this.context.jobId,
        queue: this.context.queue,
        attempt: this.context.attempt,
        payload: this.payload,
      },
      'Queue example plugin job executed',
    );

    queueExampleExecutions.push({
      ...this.payload,
      executedAt,
    });
  }
}

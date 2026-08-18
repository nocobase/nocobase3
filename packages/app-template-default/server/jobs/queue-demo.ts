import { Job } from '@nocobase/queue';
import type { Row } from '@nocobase/database';
import type { AppJobDependencies } from './dependencies.js';

export interface QueueDemoPayload {
  message: string;
  requestedAt: string;
}

export interface QueueDemoExecution extends QueueDemoPayload {
  executedAt: string;
}

export const queueDemoExecutions: QueueDemoExecution[] = [];

interface QueueDemoSettingRecord extends Row {
  key: string;
  value: string;
  createdAt: string;
  updatedAt: string;
}

export default class QueueDemoJob extends Job<QueueDemoPayload> {
  static options = {
    name: 'QueueDemo',
    queue: 'default',
  };

  private readonly dependencies: AppJobDependencies | undefined;

  constructor(dependencies?: AppJobDependencies) {
    super();
    this.dependencies = dependencies;
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
      'Queue demo job started',
    );

    await this.writeDatabaseLog(executedAt);

    queueDemoExecutions.push({
      ...this.payload,
      executedAt,
    });

    this.dependencies?.logger.info(
      {
        jobId: this.context.jobId,
        queue: this.context.queue,
      },
      'Queue demo job completed',
    );
  }

  private async writeDatabaseLog(executedAt: string): Promise<void> {
    if (!this.dependencies?.database) {
      this.dependencies?.logger.debug(
        {
          jobId: this.context.jobId,
          queue: this.context.queue,
        },
        'Queue demo database log skipped because database is not configured',
      );
      return;
    }

    const key = `queue.demo.${this.context.jobId}`;
    const record: QueueDemoSettingRecord = {
      key,
      value: JSON.stringify({
        message: this.payload.message,
        requestedAt: this.payload.requestedAt,
        executedAt,
      }),
      createdAt: executedAt,
      updatedAt: executedAt,
    };

    this.dependencies.logger.info(
      {
        jobId: this.context.jobId,
        queue: this.context.queue,
        table: 'appSettings',
        key,
      },
      'Writing queue demo database log',
    );

    const result = await this.dependencies.database
      .query()
      .insertInto<QueueDemoSettingRecord>('appSettings')
      .values(record)
      .execute();

    this.dependencies.logger.info(
      {
        jobId: this.context.jobId,
        queue: this.context.queue,
        table: 'appSettings',
        key,
        insertedCount: result.insertedCount,
      },
      'Queue demo database log written',
    );
  }
}

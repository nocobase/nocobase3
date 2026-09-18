import { createQueueService } from '@nocobase/queue';
import type { AppQueueServiceConfig } from './config.js';
import { ServiceProvider } from '@nocobase/service-provider';
import type { AppPluginApplication } from '../plugins/index.js';
import { loggingToken } from '../logging/index.js';
import { queueServiceToken } from './token.js';

export interface QueueServiceProviderOptions {
  /** Application-owned environment context, not queue/backend configuration. */
  nodeEnv?: string;
}

/** Owns the application-scoped queue service, never a process-global worker. */
export class QueueServiceProvider extends ServiceProvider<AppPluginApplication> {
  public readonly name: string = '@nocobase/app-server/queue-service';

  public constructor(
    app: AppPluginApplication,
    private readonly options: QueueServiceProviderOptions = {},
  ) {
    super(app);
  }

  public override register(): void {
    this.app.container.singleton(queueServiceToken, (container) => {
      const configured = this.app.config.get<AppQueueServiceConfig>('queue');
      const logger = container
        .resolve(loggingToken)
        .getLogger()
        .child({ module: 'queue' });
      return createQueueService(
        {
          ...configured,
          namespace: configured?.namespace ?? this.app.appName,
          queueBackend: configured?.queueBackend ?? 'inMemory',
        },
        {
          logger,
          onInMemoryQueueInitialized: (identity) => {
            if (
              this.options.nodeEnv !== 'develop' &&
              this.options.nodeEnv !== 'development'
            )
              logger.warn(
                identity,
                'Queue is running in memory mode. Jobs will be lost on restart.',
              );
          },
        },
      );
    });
  }

  public override async start(): Promise<void> {
    await this.app.container.resolve(queueServiceToken).setup();
  }

  public override async shutdown(): Promise<void> {
    await this.app.container.resolveIfCreated(queueServiceToken)?.shutdown();
  }
}

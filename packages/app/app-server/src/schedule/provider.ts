import {
  createScheduleExecuteService,
  type ManagedScheduleExecuteService,
  type ScheduleFallbackEvent,
  type ScheduleLogger,
} from '@nocobase/schedule';
import {
  ServiceProvider,
  type ServiceResolver,
} from '@nocobase/service-provider';

import { loggingToken } from '../logging/index.js';
import type { AppPluginApplication } from '../plugins/index.js';
import type { AppScheduleConfig } from './config.js';
import { scheduleExecuteServiceToken } from './token.js';

export interface ScheduleExecuteServiceProviderOptions {
  /** The application's `NODE_ENV`; the memory fallback is only reported outside development. */
  readonly nodeEnv?: string;
}

const DEVELOPMENT_ENVIRONMENTS: ReadonlySet<string> = new Set([
  'develop',
  'development',
]);

/**
 * Composes the schedule service from the `schedule` section, filling in what
 * only the application knows: its name as the default namespace and its
 * storage directory for the built-in memory configuration. Executors belong
 * to the consumers that ask for them, which set them up and shut them down;
 * this provider shuts down whatever they left running.
 */
export class ScheduleExecuteServiceProvider extends ServiceProvider<AppPluginApplication> {
  public readonly name: string = '@nocobase/app-server/schedule';
  private service: ManagedScheduleExecuteService | undefined;

  public constructor(
    app: AppPluginApplication,
    private readonly options: ScheduleExecuteServiceProviderOptions = {},
  ) {
    super(app);
  }

  public override register(): void {
    this.app.container.singleton(scheduleExecuteServiceToken, (container) =>
      this.create(container),
    );
  }

  public override async shutdown(): Promise<void> {
    await this.service?.shutdown();
  }

  private create(container: ServiceResolver): ManagedScheduleExecuteService {
    const logger: ScheduleLogger | undefined = container.has(loggingToken)
      ? container
          .resolve(loggingToken)
          .getLogger('schedule')
          .child({ module: 'schedule' })
      : undefined;
    const reportFallback = !DEVELOPMENT_ENVIRONMENTS.has(
      this.options.nodeEnv ?? '',
    );
    this.service = createScheduleExecuteService(
      this.app.config.get<AppScheduleConfig>('schedule'),
      {
        appName: this.app.appName,
        storagePath: this.app.paths.storage('schedule'),
        ...(logger ? { logger } : {}),
        onFallback: (event: ScheduleFallbackEvent) => {
          if (!reportFallback) return;
          const message = `Scope "${event.scope}" runs on the built-in memory schedule configuration: its jobs are shared by the processes of this host only, and instances on other hosts would each run their own copy. Set schedule.default to a redis configuration to run on more than one host.`;
          if (logger) logger.warn({ scope: event.scope }, message);
          else console.warn(message);
        },
      },
    );
    return this.service;
  }
}

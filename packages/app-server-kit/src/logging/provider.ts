import {
  createLogging,
  type LoggerConfig,
  type LoggingConfig,
} from '@nocobase/logging';
import { ServiceProvider } from '@nocobase/service-provider';

import type { AppPluginApplication } from '../plugins/index.js';
import { loggingConfig } from './config.js';
import { loggingToken } from './token.js';

export class LoggingProvider extends ServiceProvider<AppPluginApplication> {
  public readonly name: string = '@nocobase/app-server-kit/logging';

  public override register(): void {
    this.app.container.singleton(loggingToken, () =>
      createLogging(this.createLoggingConfig()),
    );
  }

  private createLoggingConfig(): LoggingConfig {
    const { pretty, nodeEnv, ...config } = this.app.config.get(loggingConfig);
    return {
      ...config,
      transport:
        config.transport ??
        this.createDefaultTransport(pretty ?? nodeEnv !== 'production'),
    };
  }

  private createDefaultTransport(pretty: boolean): LoggerConfig['transport'] {
    return pretty
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          },
        }
      : {
          target: 'pino-roll',
          options: {
            file: this.app.paths.storage('logs/{logger}.log'),
            frequency: 'daily',
            dateFormat: 'yyyy_MM_dd',
            mkdir: true,
            limit: { count: 6, removeOtherLogFiles: true },
          },
        };
  }

  public override async shutdown(): Promise<void> {
    await this.app.container.resolveIfCreated(loggingToken)?.flush();
  }
}

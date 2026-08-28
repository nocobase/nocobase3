import {
  createServiceToken,
  ServiceProvider,
  type ServiceContainer,
  type ServiceToken,
} from '@nocobase/service-provider';

import { createLogging, type Logging } from './logging.js';
import type { LoggingConfig } from './types.js';
import { requestLogger } from './request-logger.js';
import type { Hono } from 'hono';
import {
  defineHttpMiddleware,
  type AppHttpMiddleware,
} from '@nocobase/app-server-kit/router';

export const loggingToken: ServiceToken<Logging> =
  createServiceToken<Logging>('@nocobase/logging');

export interface LoggingProviderApplicationConfig {
  readonly logging?: LoggingConfig;
}

export interface LoggingProviderApplication<
  TConfig extends LoggingProviderApplicationConfig =
    LoggingProviderApplicationConfig,
> {
  readonly config: TConfig;
  readonly container: ServiceContainer;
}

export interface RequestLoggingMiddlewareApplication {
  readonly appName: string;
  readonly container: ServiceContainer;
}

export class LoggingProvider<
  TApplication extends LoggingProviderApplication = LoggingProviderApplication,
> extends ServiceProvider<TApplication> {
  public readonly name: string = '@nocobase/logging';

  public override register(): void {
    this.app.container.singleton(loggingToken, () =>
      createLogging(this.app.config.logging),
    );
  }

  public override async shutdown(): Promise<void> {
    await this.app.container.resolveIfCreated(loggingToken)?.flush();
  }
}

export const requestLoggingMiddleware: AppHttpMiddleware<RequestLoggingMiddlewareApplication> =
  defineHttpMiddleware({
    name: '@nocobase/logging/request',
    register(router: Hono, app: RequestLoggingMiddlewareApplication): void {
      const logging = app.container.resolve(loggingToken);
      router.use(
        '*',
        requestLogger({
          logger: logging.getLogger('request'),
          app: app.appName,
          skip: (context) => context.req.path.endsWith('/api/healthz'),
        }),
      );
    },
  });

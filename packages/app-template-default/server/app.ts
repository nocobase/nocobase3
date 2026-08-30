import { Application } from '@nocobase/app-server-kit/application';
import { DatabaseProvider } from '@nocobase/app-server-kit/database';
import {
  I18nProvider,
  i18nHttpMiddleware,
} from '@nocobase/app-server-kit/i18n';
import { healthCheckApiRoutes } from '@nocobase/app-server-kit/router';
import type { ResolvedAppRuntime } from '@nocobase/app-server-kit/runtime';
import { CachingProvider } from '@nocobase/caching';
import { DriveProvider } from '@nocobase/drive';
import { IdGeneratorProvider } from '@nocobase/id-generator';
import { LoggingProvider, requestLoggingMiddleware } from '@nocobase/logging';
import { QueueProvider } from '@nocobase/queue';
import { sessionHttpMiddleware, SessionProvider } from '@nocobase/session';
import { spaRootRoutes } from '@nocobase/app-server-kit/spa';
import type { AppConfig } from './config/index.js';
import type { DefaultAppScopeConfig } from './config/types.js';

export function createApp(
  runtime: ResolvedAppRuntime<AppConfig, DefaultAppScopeConfig>,
): Application<AppConfig> {
  const app = new Application({
    config: runtime.config,
    paths: runtime.configPaths,
  });
  app.addProvider(DatabaseProvider);
  app.addProvider(I18nProvider);
  app.addProvider(LoggingProvider);
  app.addProvider(CachingProvider);
  app.addProvider(IdGeneratorProvider);
  app.addProvider(SessionProvider);
  app.addProvider(DriveProvider);
  app.addProvider(QueueProvider);
  app.addHttpMiddleware(requestLoggingMiddleware);
  app.addHttpMiddleware(sessionHttpMiddleware);
  // After the session, whose stored language outranks the request's Accept-Language header.
  app.addHttpMiddleware(i18nHttpMiddleware);
  app.addRoutes(healthCheckApiRoutes);
  app.addRuntimeContributions(runtime);
  app.addRoutes(spaRootRoutes);

  return app;
}

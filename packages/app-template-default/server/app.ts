import { Application } from '@nocobase/app-server-kit/application';
import { DatabaseProvider } from '@nocobase/app-server-kit/database';
import { CachingProvider } from '@nocobase/app-server-kit/caching';
import { DriveProvider } from '@nocobase/app-server-kit/drive';
import { IdGeneratorProvider } from '@nocobase/app-server-kit/id-generator';
import {
  LoggingProvider,
  requestLoggingMiddleware,
} from '@nocobase/app-server-kit/logging';
import { QueueProvider } from '@nocobase/app-server-kit/queue';
import {
  SessionProvider,
  sessionHttpMiddleware,
} from '@nocobase/app-server-kit/session';
import { healthCheckApiRoutes } from '@nocobase/app-server-kit/router';
import type { ResolvedAppRuntime } from '@nocobase/app-server-kit/runtime';
import { spaRootRoutes } from '@nocobase/app-server-kit/spa';

export function createApp(runtime: ResolvedAppRuntime): Application {
  const app = new Application({
    config: runtime.appConfig,
    mode: runtime.mode,
    appName: runtime.routing.name,
    publicBasePath: runtime.routing.publicBasePath,
    paths: runtime.configPaths,
  });
  app.addProvider(DatabaseProvider);
  app.addProvider(LoggingProvider);
  app.addProvider(CachingProvider);
  app.addProvider(IdGeneratorProvider);
  app.addProvider(SessionProvider);
  app.addProvider(DriveProvider);
  app.addProvider(QueueProvider);
  app.addHttpMiddleware(requestLoggingMiddleware);
  app.addHttpMiddleware(sessionHttpMiddleware);
  app.addApiRoutes(healthCheckApiRoutes);
  app.addRuntimeContributions(runtime);
  app.addRootRoutes(spaRootRoutes);

  return app;
}

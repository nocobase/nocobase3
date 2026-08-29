import {
  createServiceToken,
  ServiceProvider,
  type ServiceContainer,
  type ServiceToken,
} from '@nocobase/service-provider';

import { createNullSessionConfig, createSessionManager } from './manager.js';
import type { AppSessionConfig, NocoBaseSessionManager } from './types.js';
import { createSessionMiddleware } from './hono.js';
import type { Hono } from 'hono';
import {
  defineHttpMiddleware,
  type AppHttpMiddleware,
} from '@nocobase/app-server-kit/router';

export const sessionManagerToken: ServiceToken<NocoBaseSessionManager> =
  createServiceToken<NocoBaseSessionManager>('@nocobase/session/manager');

export interface SessionProviderApplicationConfig {
  readonly session?: AppSessionConfig;
}

export interface SessionProviderApplication<
  TConfig extends SessionProviderApplicationConfig =
    SessionProviderApplicationConfig,
> {
  readonly config: TConfig;
  readonly container: ServiceContainer;
}

export interface SessionHttpMiddlewareApplication {
  readonly container: ServiceContainer;
}

export class SessionProvider<
  TApplication extends SessionProviderApplication = SessionProviderApplication,
> extends ServiceProvider<TApplication> {
  public readonly name: string = '@nocobase/session';

  public override register(): void {
    this.app.container.singleton(sessionManagerToken, () =>
      createSessionManager(
        this.app.config.session ?? createNullSessionConfig(),
      ),
    );
  }

  public override async shutdown(): Promise<void> {
    await this.app.container.resolveIfCreated(sessionManagerToken)?.dispose();
  }
}

export const sessionHttpMiddleware: AppHttpMiddleware<SessionHttpMiddlewareApplication> =
  defineHttpMiddleware({
    name: '@nocobase/session/http',
    register(router: Hono, app: SessionHttpMiddlewareApplication): void {
      router.use(
        '*',
        createSessionMiddleware(app.container.resolve(sessionManagerToken)),
      );
    },
  });

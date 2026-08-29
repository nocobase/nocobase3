import type { Hono } from 'hono';
import {
  createSessionManager,
  createSessionMiddleware,
} from '@nocobase/session';
import { ServiceProvider } from '@nocobase/service-provider';

import type { AppPluginApplication } from '../plugins/index.js';
import {
  defineHttpMiddleware,
  type AppHttpMiddleware,
} from '../router/index.js';
import { sessionConfig } from './config.js';
import { sessionManagerToken } from './token.js';

export class SessionProvider extends ServiceProvider<AppPluginApplication> {
  public readonly name: string = '@nocobase/app-server-kit/session';

  public override register(): void {
    this.app.container.singleton(sessionManagerToken, () =>
      createSessionManager(this.app.config.get(sessionConfig)),
    );
  }

  public override async shutdown(): Promise<void> {
    await this.app.container.resolveIfCreated(sessionManagerToken)?.dispose();
  }
}

export const sessionHttpMiddleware: AppHttpMiddleware<AppPluginApplication> =
  defineHttpMiddleware({
    name: '@nocobase/app-server-kit/session/http',
    register(router: Hono, app: AppPluginApplication): void {
      router.use(
        '*',
        createSessionMiddleware(app.container.resolve(sessionManagerToken)),
      );
    },
  });

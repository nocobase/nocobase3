import { randomBytes } from 'node:crypto';

import type { Hono } from 'hono';
import {
  createSessionManager,
  createSessionMiddleware,
  type AppSessionConfig,
} from '@nocobase/session';
import { ServiceProvider } from '@nocobase/service-provider';

import type { AppPluginApplication } from '../plugins/index.js';
import {
  defineHttpMiddleware,
  type AppHttpMiddleware,
} from '../router/index.js';
import { type AppSessionConfigInput } from './config.js';
import { sessionManagerToken } from './token.js';

export class SessionProvider extends ServiceProvider<AppPluginApplication> {
  public readonly name: string = '@nocobase/app-server/session';
  private readonly ephemeralSecret: string =
    randomBytes(32).toString('base64url');

  public override register(): void {
    this.app.container.singleton(sessionManagerToken, () =>
      createSessionManager(
        resolveAppSessionConfig(
          this.app.config.get<AppSessionConfigInput>('session')!,
          this.ephemeralSecret,
        ),
      ),
    );
  }

  public override async shutdown(): Promise<void> {
    await this.app.container.resolveIfCreated(sessionManagerToken)?.dispose();
  }
}

export function resolveAppSessionConfig(
  configured: AppSessionConfigInput,
  ephemeralSecret: string,
): AppSessionConfig {
  const { gcLottery: configuredGcLottery, secret, ...rest } = configured;
  const gcLottery = configuredGcLottery ?? { hits: 2, total: 100 };
  if (gcLottery.hits > gcLottery.total) {
    throw new Error(
      'session.gcLottery.hits must not exceed session.gcLottery.total.',
    );
  }
  return {
    ...rest,
    secret: secret ?? ephemeralSecret,
    gcLottery: [gcLottery.hits, gcLottery.total],
  };
}

export const sessionHttpMiddleware: AppHttpMiddleware<AppPluginApplication> =
  defineHttpMiddleware({
    name: '@nocobase/app-server/session/http',
    register(router: Hono, app: AppPluginApplication): void {
      router.use(
        '*',
        createSessionMiddleware(app.container.resolve(sessionManagerToken)),
      );
    },
  });

import {
  I18nRuntime,
  type Locale,
  type LocalesModule,
} from '@nocobase/app-i18n';
import { createI18nMiddleware } from '@nocobase/app-i18n/server';
import type { Hono } from 'hono';
import {
  ServiceProvider,
  createServiceToken,
  type ServiceContainer,
  type ServiceToken,
} from '@nocobase/service-provider';

import {
  defineHttpMiddleware,
  type AppHttpMiddleware,
} from '../router/index.js';

export const i18nToken: ServiceToken<I18nRuntime> =
  createServiceToken<I18nRuntime>('@nocobase/app/i18n');

export interface AppI18nConfig {
  readonly defaultLocale: Locale;
  readonly locales: readonly Locale[];
}

export interface I18nProviderApplication {
  readonly container: ServiceContainer;
  readonly config: {
    readonly i18n?: AppI18nConfig;
  };
}

export interface AppI18nLocaleContribution {
  readonly packageName: string;
  readonly locales: LocalesModule;
}

/**
 * Registers the i18n runtime as a service.
 *
 * Only the default locale's resources are loaded at startup; another locale is imported the first time a request
 * actually needs it, and stays in memory afterwards.
 */
export class I18nProvider<
  TApplication extends I18nProviderApplication = I18nProviderApplication,
> extends ServiceProvider<TApplication> {
  public readonly name: string = 'i18n';

  public override register(): void {
    const config = this.app.config.i18n;
    this.app.container.instance(
      i18nToken,
      new I18nRuntime({
        defaultLocale: config?.defaultLocale ?? 'en-US',
        locales: config?.locales ?? [config?.defaultLocale ?? 'en-US'],
      }),
    );
  }
}

/**
 * Registers each plugin's locale loaders against its package name and initializes the runtime.
 */
export async function registerAppLocales(
  runtime: I18nRuntime,
  applicationPackageName: string,
  contributions: readonly AppI18nLocaleContribution[],
): Promise<void> {
  for (const contribution of contributions) {
    if (contribution.packageName === applicationPackageName) {
      runtime.registerApplicationNamespace(
        contribution.packageName,
        contribution.locales,
      );
    } else {
      runtime.registerNamespace(contribution.packageName, contribution.locales);
    }
  }

  await runtime.init();
}

/**
 * Resolves the request's language and puts a translator on the context.
 *
 * Mount it after the session middleware: a visitor's stored choice lives there, and it outranks `Accept-Language`.
 */
export const i18nHttpMiddleware: AppHttpMiddleware<I18nProviderApplication> =
  defineHttpMiddleware({
    name: '@nocobase/app/i18n',
    register(router: Hono, app: I18nProviderApplication): void {
      router.use('*', createI18nMiddleware(app.container.resolve(i18nToken)));
    },
  });

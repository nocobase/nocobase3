import { I18nRuntime, type Locale, type LocalesModule } from '@nocobase/i18n';
import { Type } from '@sinclair/typebox';
import { createI18nMiddleware } from '@nocobase/i18n/server';
import type { Hono } from 'hono';
import {
  type AppConfigAccessor,
  defineAppConfig,
  envString,
  type AppConfigDefinition,
} from '../config/index.js';
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
}

/**
 * Which language the application answers in when nothing else decides.
 *
 * There is deliberately no list of supported languages here: the application's own `locales/` files are that list, so
 * adding a language means adding its file rather than editing configuration in a second place. A plugin's locale file
 * supplies translations for a language the application already offers; it never adds one.
 */
export const i18nConfig: AppConfigDefinition<AppI18nConfig> = defineAppConfig({
  namespace: 'i18n',
  schema: Type.Object(
    {
      defaultLocale: Type.String(),
    },
    { additionalProperties: false },
  ),
  defaults: { defaultLocale: 'en-US' },
  envMappings: {
    APP_DEFAULT_LOCALE: envString('defaultLocale'),
  },
});

export interface I18nProviderApplication {
  readonly container: ServiceContainer;
  readonly config: AppConfigAccessor;
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
    const config = this.app.config.get(i18nConfig);
    // Only the default locale is known here. The languages on offer follow from the application's own locale files,
    // which are registered later in the boot sequence by `registerAppLocales`.
    this.app.container.instance(
      i18nToken,
      new I18nRuntime({ defaultLocale: config.defaultLocale }),
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

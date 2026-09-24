import {
  ClientApplicationContext,
  type ClientApplication,
} from '@nocobase/app-client';
import authorization, {
  authorizationClientToken,
} from '@nocobase/app-plugin-authorization/client';
import type { AuthorizationOptions } from '@nocobase/app-plugin-authorization/client/management';
import { I18nRuntime } from '@nocobase/i18n';
import { I18nProvider } from '@nocobase/i18n/client';
import { ServiceContainer } from '@nocobase/service-provider';
import { render, type RenderResult } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router';
import plugin from '../client/plugin.js';

const AUTHORIZATION = '@nocobase/app-plugin-authorization';

type Section = AuthorizationOptions['sections'][number];
type Subsection = Section['subsections'][number];
type Resource = Subsection['resources'][number];

const builtIn = [
  { value: 'pages', label: 'Page permissions', order: 0 },
  { value: 'business', label: 'Business permissions', order: 100 },
  { value: 'administration', label: 'Administration', order: 200 },
];

/** The built-in sections holding `subsections`, keyed by section name. */
export function withSubsections(
  subsections: Readonly<Record<string, readonly Subsection[]>>,
): Section[] {
  return builtIn.map((section) => ({
    ...section,
    subsections: [...(subsections[section.value] ?? [])],
  }));
}

/** A subsection whose actions are every action its resources name. */
export function subsection(
  value: string,
  label: string,
  resources: readonly Resource[],
): Subsection {
  return {
    value,
    label,
    groups: [],
    actions: [
      ...new Map(
        resources
          .flatMap((item) => item.actions ?? [])
          .map((item) => [item.value, item]),
      ).values(),
    ],
    resources: [...resources],
  };
}

/** The English catalogues of this plugin and the authorization plugin, as the runtime loads them. */
export async function englishRuntime(): Promise<I18nRuntime> {
  const runtime = new I18nRuntime({
    defaultLocale: 'en-US',
    locales: ['en-US'],
  });
  runtime.registerNamespace(AUTHORIZATION, authorization().locales!);
  runtime.registerNamespace(plugin().packageName, plugin().locales!);
  await runtime.init();
  return runtime;
}

/** A key of this plugin or, with `shared`, of the authorization plugin, in English. */
export function translate(
  runtime: I18nRuntime,
  key: string,
  shared = false,
): string {
  return runtime.i18n.t(key, {
    ns: shared ? AUTHORIZATION : plugin().packageName,
  });
}

/** Renders `ui` inside an application whose every page check passes. */
export function renderPanel(
  runtime: I18nRuntime,
  ui: ReactElement,
  path = '/',
): RenderResult {
  const services = new ServiceContainer();
  services.instance(authorizationClientToken, {
    can: () => Promise.resolve(true),
    revision: () => 0,
    onInvalidated: () => () => {},
  } as never);
  const app = { services } as unknown as ClientApplication;
  return render(
    <ClientApplicationContext.Provider value={app}>
      <I18nProvider runtime={runtime}>
        <MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>
      </I18nProvider>
    </ClientApplicationContext.Provider>,
  );
}

import type { ReactNode } from 'react';
import { render, type RenderResult } from '@testing-library/react';
import {
  AppClientRoot,
  ClientApplication,
  createAppClientConfig,
} from '@nocobase/app-client';
import {
  defineAppRuntime,
  resolveAppRuntime,
} from '@nocobase/app-client/runtime';
import { defineClientPlugins } from '@nocobase/app-client/plugins';
import { I18nProvider } from '@nocobase/i18n/client';
import { ServiceProvider } from '@nocobase/service-provider';
import audit from '@nocobase/app-plugin-audit/client';

class TestProvider extends ServiceProvider<ClientApplication> {
  readonly name: string = '@example/audit-test';
  override boot(): Promise<void> {
    this.app.refine.setRouterProvider({});
    return Promise.resolve();
  }
}

type ClientRuntime = Awaited<ReturnType<typeof resolveAppRuntime>>;

export async function createAuditClientRuntime(
  locale: string,
): Promise<ClientRuntime> {
  const runtime = await resolveAppRuntime(
    defineAppRuntime({
      packageName: '@example/audit-test',
      config: createAppClientConfig,
      serviceProviders: [TestProvider],
      plugins: defineClientPlugins([audit()]),
    }),
  );
  await runtime.i18n.changeLanguage(locale);
  return runtime;
}

export async function renderAuditClient(
  runtime: ClientRuntime,
  children: ReactNode,
  cleanups: (() => Promise<void>)[],
): Promise<RenderResult> {
  const app = new ClientApplication({
    runtime,
    createRenderConfig: () => ({
      routes: <I18nProvider runtime={runtime.i18n}>{children}</I18nProvider>,
    }),
  });
  cleanups.push(() => app.shutdown());
  await app.start();
  return render(<AppClientRoot app={app} />);
}

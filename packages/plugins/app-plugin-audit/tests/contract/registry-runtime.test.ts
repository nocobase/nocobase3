import '../components/events-dom.mjs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { createElement, type ComponentType } from 'react';
import { render, cleanup, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
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
import type { AuditEventsViewProps } from '@nocobase/app-plugin-audit/client/components';
import {
  auditPermissionId,
  auditServiceToken,
} from '@nocobase/app-plugin-audit/server';
import { authorizationToken } from '@nocobase/app-plugin-authorization';
import { createSkillsApp } from './skills-app.js';

class RecipeHost extends ServiceProvider<ClientApplication> {
  readonly name: string = 'g21-recipe-host';
  override boot(): Promise<void> {
    this.app.refine.setRouterProvider({});
    return Promise.resolve();
  }
}

describe('installed recipe with production App API', () => {
  it('renders the materialized App-owned wrapper and preserves API authorization', async () => {
    const modulePath = resolve(
      import.meta.dirname,
      '../../registry/events-panel/index.tsx',
    );
    const { AuditEventsPanel } = (await import(
      pathToFileURL(modulePath).href
    )) as { AuditEventsPanel: ComponentType<AuditEventsViewProps> };
    const server = await createSkillsApp('sqlite');
    let clientApp: ClientApplication | undefined;
    try {
      const signup = await server.app.fetch(
        new Request('http://localhost/api/auth/sign-up/email', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            origin: 'http://localhost',
          },
          body: JSON.stringify({
            name: 'Panel User',
            email: 'g21panel@example.test',
            password: 'panel synthetic password',
          }),
        }),
      );
      expect(signup.status).toBe(200);
      const user = (await signup.json()) as { user: { id: string } };
      let cookie = signup.headers.get('set-cookie') ?? '';
      const authz = server.app.container.resolve(authorizationToken);
      await authz.permissionSets.create({
        key: 'g21-panel',
        grants: [
          {
            resource: {
              type: 'audit.events',
              id: auditPermissionId({ appId: 'main' }, 'main'),
            },
            actions: ['read', 'readAll', 'readMetadata'].map((action) => ({
              action,
            })),
          },
        ],
      });
      await authz.permissionSets.assign({
        subject: { type: 'user', id: user.user.id },
        permissionSet: 'g21-panel',
      });
      await server.app.container
        .resolve(auditServiceToken)
        .bind(
          { appId: 'main', actor: { type: 'user', id: user.user.id } },
          { producer: 'g21-panel' },
        )
        .record({ action: 'g21.panel.visible', outcome: 'success' });
      const requests: { path: string; status: number }[] = [];
      vi.stubGlobal(
        'fetch',
        async (input: string | URL | Request, init?: RequestInit) => {
          const url = new URL(
            typeof input === 'string'
              ? input
              : input instanceof URL
                ? input.href
                : input.url,
            'http://localhost',
          );
          const headers = new Headers(init?.headers);
          headers.set('cookie', cookie);
          const response = await server.app.fetch(
            new Request(url, { ...init, headers }),
          );
          requests.push({
            path: url.pathname + url.search,
            status: response.status,
          });
          return response;
        },
      );
      const runtime = await resolveAppRuntime(
        defineAppRuntime({
          packageName: 'g21-isolated-app',
          config: createAppClientConfig,
          serviceProviders: [RecipeHost],
          plugins: defineClientPlugins([audit()]),
        }),
      );
      await runtime.i18n.changeLanguage('en-US');
      clientApp = new ClientApplication({
        runtime,
        createRenderConfig: () => ({
          routes: createElement(
            I18nProvider,
            { runtime: runtime.i18n },
            createElement(AuditEventsPanel, {
              query: { store: 'main', action: 'g21.panel.visible' },
            }),
          ),
        }),
      });
      await clientApp.start();
      render(createElement(AppClientRoot, { app: clientApp }));
      expect(
        await screen.findByRole('button', { name: /g21.panel.visible/ }),
      ).toBeTruthy();
      expect(
        requests.some(
          (item) =>
            item.path.startsWith('/api/audit/events?') && item.status === 200,
        ),
      ).toBe(true);
      cleanup();
      cookie = '';
      render(createElement(AppClientRoot, { app: clientApp }));
      expect(
        await screen.findByText(/permission|authorized|access/i),
      ).toBeTruthy();
      expect(requests.some((item) => item.status === 401)).toBe(true);
    } finally {
      cleanup();
      vi.unstubAllGlobals();
      await clientApp?.shutdown();
      await server.close();
    }
  });
});

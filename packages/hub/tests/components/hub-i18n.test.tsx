import { fireEvent, render, screen } from '@testing-library/react';
import { Refine, type I18nProvider } from '@refinedev/core';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';

import {
  i18n,
  i18nProvider as portalI18nProvider,
} from '@nocobase/app-portal-sdk/i18n';

import '@/locales';
import { Header } from '@/components/app-shell/header';
import { ThemeProvider } from '@/components/theme/theme-provider';
import { SidebarProvider } from '@/components/ui/sidebar';
import { ApplicationsPage } from '@/pages/applications/list';
import { ApplicationDetailPage } from '@/pages/applications/detail';
import { DeploymentDetailPage } from '@/pages/deployments/detail';
import { portalI18nReady } from '@/providers/i18n/runtime';

function response<T>(data: T) {
  return Response.json({
    data,
    meta: {
      total: Array.isArray(data) ? data.length : 1,
      limit: 20,
      offset: 0,
    },
    requestId: 'i18n-test',
  });
}

beforeAll(async () => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
  await portalI18nReady;
});

afterAll(async () => {
  await i18n.changeLanguage('en-US');
  vi.unstubAllGlobals();
});

describe('Hub language switching', () => {
  it('changes the Refine locale to Simplified Chinese from the header', async () => {
    const changeLocale = vi.fn(async () => undefined);
    const i18nProvider: I18nProvider = {
      changeLocale,
      getLocale: () => 'en-US',
      translate: (key, options, defaultMessage) =>
        typeof options === 'string'
          ? options
          : (defaultMessage ?? options?.defaultValue ?? key),
    };

    render(
      <MemoryRouter>
        <ThemeProvider>
          <Refine
            i18nProvider={i18nProvider}
            authProvider={{
              login: async () => ({ success: true }),
              logout: async () => ({ success: true }),
              check: async () => ({ authenticated: true }),
              onError: async () => ({}),
              getIdentity: async () => ({
                id: 1,
                firstName: 'Hub',
                lastName: 'Owner',
                fullName: 'Hub Owner',
                email: 'owner@example.com',
              }),
            }}
          >
            <SidebarProvider>
              <Header />
            </SidebarProvider>
          </Refine>
        </ThemeProvider>
      </MemoryRouter>,
    );

    const standaloneLanguageButton = screen.queryByRole('button', {
      name: 'Language',
    });
    if (standaloneLanguageButton) {
      fireEvent.click(standaloneLanguageButton);
    } else {
      const headerButtons = screen.getAllByRole('button');
      fireEvent.click(headerButtons[headerButtons.length - 1]);
      fireEvent.click(await screen.findByText('Language'));
    }
    fireEvent.click(await screen.findByText('简体中文'));

    expect(changeLocale).toHaveBeenCalledWith('zh-CN');
  });
});

describe('Hub Chinese application page', () => {
  it('renders the Applications title and empty state in Simplified Chinese', async () => {
    await i18n.changeLanguage('zh-CN');
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const path = String(input);
      if (path.endsWith('/apps')) return response([]);
      if (path.endsWith('/me')) {
        return response({
          user: null,
          roles: ['Viewer'],
          capabilities: {
            global: [{ resource: 'hub.app', actions: ['read'] }],
            application: [],
          },
        });
      }
      throw new Error(`Unexpected request: ${path}`);
    });

    render(
      <MemoryRouter>
        <Refine i18nProvider={portalI18nProvider}>
          <ApplicationsPage fetcher={fetcher} />
        </Refine>
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole('heading', { name: '应用' }),
    ).toBeInTheDocument();
    expect(await screen.findByText('暂无应用')).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Applications' }),
    ).not.toBeInTheDocument();
  });

  it('renders deployment details in Simplified Chinese', async () => {
    await i18n.changeLanguage('zh-CN');
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const path = String(input);
      if (path.endsWith('/deployments/deployment-1/events')) {
        return response([]);
      }
      if (path.endsWith('/deployments/deployment-1')) {
        return response({
          id: 'deployment-1',
          applicationId: 'app-1',
          environmentId: 'default',
          targetReleaseId: 'release-1',
          previousReleaseId: null,
          type: 'deploy',
          status: 'succeeded',
          requestedBy: 'owner',
          hostOperationId: 'operation-1',
          startedAt: '2026-08-21T09:00:00.000Z',
          finishedAt: '2026-08-21T09:01:00.000Z',
          failure: null,
          createdAt: '2026-08-21T09:00:00.000Z',
        });
      }
      if (path.endsWith('/me')) {
        return response({
          user: null,
          roles: ['Viewer'],
          capabilities: {
            global: [{ resource: 'hub.deployment', actions: ['read'] }],
            application: [],
          },
        });
      }
      throw new Error(`Unexpected request: ${path}`);
    });

    render(
      <MemoryRouter>
        <Refine i18nProvider={portalI18nProvider}>
          <DeploymentDetailPage deploymentId='deployment-1' fetcher={fetcher} />
        </Refine>
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole('heading', { name: '部署 deployment-1' }),
    ).toBeInTheDocument();
    expect(screen.getByText('部署进度')).toBeInTheDocument();
    expect(screen.getByText('事件时间线')).toBeInTheDocument();
    expect(screen.getByText('操作详情')).toBeInTheDocument();
  });

  it('keeps the empty default APP overview free of onboarding copy', async () => {
    await i18n.changeLanguage('zh-CN');
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const path = String(input);
      if (path.endsWith('/apps/system-default-application')) {
        return response({
          id: 'system-default-application',
          slug: 'default',
          name: 'Default application',
          description: null,
          status: 'active',
          defaultEnvironmentId: 'default',
          isDefault: true,
          latestRelease: null,
          activeRelease: null,
          createdBy: 'system',
          createdAt: '2026-08-27T09:00:00.000Z',
          updatedAt: '2026-08-27T09:00:00.000Z',
          links: {
            self: '/hub/api/apps/system-default-application',
            open: null,
          },
        });
      }
      if (path.endsWith('/apps/system-default-application/releases')) {
        return Response.json({
          data: [],
          meta: { total: 0, limit: 20, offset: 0 },
          requestId: 'i18n-test',
        });
      }
      if (path.endsWith('/apps/system-default-application/deployments')) {
        return Response.json({
          data: [],
          meta: { total: 0, limit: 20, offset: 0 },
          requestId: 'i18n-test',
        });
      }
      if (path.endsWith('/me')) {
        return response({
          user: null,
          roles: ['Developer'],
          capabilities: {
            global: [
              { resource: 'hub.app', actions: ['read'] },
              { resource: 'hub.release', actions: ['read', 'create'] },
              { resource: 'hub.deployment', actions: ['read', 'deploy'] },
            ],
            application: [],
          },
        });
      }
      throw new Error(`Unexpected request: ${path}`);
    });

    render(
      <MemoryRouter>
        <Refine i18nProvider={portalI18nProvider}>
          <ApplicationDetailPage
            applicationId='system-default-application'
            fetcher={fetcher}
          />
        </Refine>
      </MemoryRouter>,
    );

    await screen.findByRole('heading', { name: 'Default application' });
    expect(
      screen.queryByRole('heading', { name: '构建并部署此应用' }),
    ).toBeNull();
    expect(screen.queryByText('使用已有本地应用')).toBeNull();
    expect(screen.queryByText('创建新的本地应用')).toBeNull();
    expect(screen.getAllByText('尚未部署').length).toBeGreaterThan(0);
    expect(screen.queryByText('运行中')).toBeNull();
    expect(screen.queryByRole('button', { name: '查看开发指令' })).toBeNull();
  });
});

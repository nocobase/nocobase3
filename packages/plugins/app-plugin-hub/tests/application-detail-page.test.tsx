import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nRuntime } from '@nocobase/i18n';
import { I18nProvider, NamespaceScope } from '@nocobase/i18n/client';
import { Link, MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HubApplicationsProvider } from '../client/components/hub-applications-provider.js';
import locales from '../client/locales/index.js';
import ApplicationDetailPage from '../client/pages/application-detail-page.js';

function renderPage(entry = '/apps/crm'): ReturnType<typeof render> {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <HubApplicationsProvider>
        <Routes>
          <Route path='/apps/:appId' element={<ApplicationDetailPage />} />
        </Routes>
      </HubApplicationsProvider>
    </MemoryRouter>,
  );
}

describe('ApplicationDetailPage', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'APP_BASE_PATH', {
      configurable: true,
      value: '/hub/',
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(window, 'APP_BASE_PATH');
  });

  it('provides the Hub quick setup workflow and copyable commands', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    renderPage('/apps/warehouse?tab=development');

    for (const tab of [
      'Overview',
      'Development',
      'Releases',
      'Deployments',
      'Activity',
      'Permissions',
      'Settings',
    ]) {
      expect(screen.getByRole('tab', { name: tab })).toBeVisible();
    }

    expect(screen.getByRole('heading', { name: 'Quick setup' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Development' })).toBeVisible();
    expect(
      screen.getByRole('heading', { name: 'No local APP source' }),
    ).toBeVisible();
    expect(
      screen.getByRole('heading', { name: 'Existing local APP source' }),
    ).toBeVisible();
    expect(
      screen.getByRole('heading', { name: 'Deploy to this Hub' }),
    ).toBeVisible();

    const createCopyButton = screen.getByRole('button', {
      name: 'Copy create APP commands',
    });
    await user.click(createCopyButton);
    expect(writeText).toHaveBeenNthCalledWith(
      1,
      'pnpm config set @nocobase:registry https://npm.nocobase.ai/\n' +
        'pnpm create @nocobase/app wms\n' +
        'cd wms\n' +
        'pnpm dev',
    );
    expect(createCopyButton).toHaveAccessibleName('Copied');

    await user.click(
      screen.getByRole('button', { name: 'Copy existing APP commands' }),
    );
    expect(writeText).toHaveBeenNthCalledWith(
      2,
      'cd <existing-app-directory>\npnpm install\npnpm dev',
    );

    await user.click(
      screen.getByRole('button', { name: 'Copy deployment command' }),
    );
    expect(writeText).toHaveBeenNthCalledWith(
      3,
      `pnpm run deploy --hub ${window.location.origin}/hub --app wms`,
    );
    expect(screen.getByText('pnpm run deploy')).toBeVisible();
  });

  it('renders the quick setup workflow from the Chinese locale', async () => {
    const runtime = new I18nRuntime({
      defaultLocale: 'en-US',
      locales: ['en-US', 'zh-CN'],
    });
    runtime.registerNamespace('@nocobase/app-plugin-hub', locales);
    await runtime.init('zh-CN');

    render(
      <I18nProvider runtime={runtime}>
        <NamespaceScope ns='@nocobase/app-plugin-hub'>
          <MemoryRouter initialEntries={['/apps/warehouse?tab=development']}>
            <HubApplicationsProvider>
              <Routes>
                <Route
                  path='/apps/:appId'
                  element={<ApplicationDetailPage />}
                />
              </Routes>
            </HubApplicationsProvider>
          </MemoryRouter>
        </NamespaceScope>
      </I18nProvider>,
    );

    expect(screen.getByRole('heading', { name: '快速开始' })).toBeVisible();
    expect(
      screen.getByRole('heading', { name: '本地没有 APP 源码' }),
    ).toBeVisible();
    expect(
      screen.getByRole('heading', { name: '本地已有 APP 源码' }),
    ).toBeVisible();
    expect(
      screen.getByRole('heading', { name: '部署到当前 Hub' }),
    ).toBeVisible();
  });

  it('supports release and permission mutations inside the page', async () => {
    const user = userEvent.setup();
    renderPage('/apps/analytics?tab=releases');

    await user.click(screen.getByRole('button', { name: 'Pin version 1.4.0' }));
    expect(screen.getAllByText('Pinned')).toHaveLength(2);

    await user.click(screen.getByRole('tab', { name: 'Permissions' }));
    await user.click(screen.getByRole('button', { name: 'Add authorization' }));
    await user.selectOptions(screen.getByLabelText('Member'), 'member-2');
    await user.selectOptions(screen.getByLabelText('Role'), 'operator');
    await user.click(screen.getByRole('button', { name: 'Add access' }));
    expect(screen.getByText('Lin Chen')).toBeVisible();
  });

  it('links application deployments to the registered detail route', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/apps/warehouse?tab=deployments']}>
        <HubApplicationsProvider>
          <Routes>
            <Route path='/apps/:appId' element={<ApplicationDetailPage />} />
            <Route
              path='/deployments/:deploymentId'
              element={<h1>Deployment destination</h1>}
            />
          </Routes>
        </HubApplicationsProvider>
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('link', { name: 'DEP-1042' }));
    expect(
      screen.getByRole('heading', { name: 'Deployment destination' }),
    ).toBeVisible();
  });

  it('renders deployment history with the compact deployment columns', () => {
    renderPage('/apps/warehouse?tab=deployments');

    expect(
      screen.getAllByRole('columnheader').map((header) => header.textContent),
    ).toEqual([
      'Deployment',
      'Type',
      'Version',
      'Status',
      'Initiated by',
      'Start time',
      'Duration',
    ]);
    expect(screen.queryByText('Original version')).not.toBeInTheDocument();
  });

  it('keeps locally generated deployment ids unique after remounting the route', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/apps/warehouse?tab=releases']}>
        <HubApplicationsProvider>
          <Routes>
            <Route
              path='/apps/:appId'
              element={
                <>
                  <ApplicationDetailPage />
                  <Link to='/away'>Leave details</Link>
                </>
              }
            />
            <Route
              path='/away'
              element={
                <Link to='/apps/warehouse?tab=releases'>Return to details</Link>
              }
            />
          </Routes>
        </HubApplicationsProvider>
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: 'Redeploy' }));
    await user.click(
      screen.getByRole('button', { name: 'Confirm redeployment' }),
    );
    await user.click(screen.getByRole('link', { name: 'Leave details' }));
    await user.click(screen.getByRole('link', { name: 'Return to details' }));
    await user.click(screen.getAllByRole('button', { name: 'Redeploy' })[0]);
    await user.click(
      screen.getByRole('button', { name: 'Confirm redeployment' }),
    );

    await user.click(screen.getByRole('tab', { name: 'Deployments' }));

    const localDeploymentIds = screen
      .getAllByText(/^DEP-LOCAL-/)
      .map((element) => element.textContent);
    expect(new Set(localDeploymentIds).size).toBe(localDeploymentIds.length);
  });
});

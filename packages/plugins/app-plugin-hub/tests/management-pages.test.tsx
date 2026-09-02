import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nRuntime } from '@nocobase/i18n';
import { I18nProvider, NamespaceScope } from '@nocobase/i18n/client';
import { Link, MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import locales from '../client/locales/index.js';
import AuditPage from '../client/pages/audit-page.js';
import DeploymentDetailPage from '../client/pages/deployment-detail-page.js';
import DeploymentsPage from '../client/pages/deployments-page.js';
import MembersPage from '../client/pages/members-page.js';

describe('deployment pages', () => {
  it('filters, sorts, exports, and paginates deployment history', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <DeploymentsPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Deployments' })).toBeVisible();
    await user.selectOptions(screen.getByLabelText('Status'), 'succeeded');
    expect(screen.getByText('DEP-1042')).toBeVisible();
    expect(screen.queryByText('DEP-1041')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Requested by')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Find a deployment' }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(screen.getByText('DEP-1041')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeEnabled();
    expect(screen.getByLabelText('Sort deployments')).toBeVisible();
  });

  it('shows deployment progress, events, and local redeploy', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/deployments/deploy-1042']}>
        <Routes>
          <Route
            path='/deployments/:deploymentId'
            element={<DeploymentDetailPage />}
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(
      screen.getByRole('heading', { name: 'Deployment DEP-1042' }),
    ).toBeVisible();
    expect(screen.getByText('Deployment timeline')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Redeploy' }));
    await user.click(screen.getByRole('button', { name: 'Confirm redeploy' }));
    expect(screen.getByText('Redeployment queued')).toBeVisible();
  });

  it('loads the new record when the deployment route parameter changes', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/deployments/deploy-1042']}>
        <Routes>
          <Route
            path='/deployments/:deploymentId'
            element={
              <>
                <DeploymentDetailPage />
                <Link to='/deployments/deploy-1041'>Next deployment</Link>
              </>
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(
      screen.getByRole('heading', { name: 'Deployment DEP-1042' }),
    ).toBeVisible();
    await user.click(screen.getByRole('link', { name: 'Next deployment' }));
    expect(
      await screen.findByRole('heading', { name: 'Deployment DEP-1041' }),
    ).toBeVisible();
  });
});

describe('AuditPage', () => {
  it('offers multidimensional filters, CSV export, and safe detail dialog', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AuditPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Audit log' })).toBeVisible();
    expect(
      screen.getByRole('columnheader', { name: 'Target object' }),
    ).toBeVisible();
    expect(screen.queryByLabelText('Actor')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Object type')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Object ID')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Explore activity' }),
    ).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Result'), 'success');
    expect(screen.getByText('application.started')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeEnabled();
    await user.click(
      screen.getAllByRole('button', { name: 'View details' })[0],
    );
    expect(
      screen.getByRole('dialog', { name: 'Audit event details' }),
    ).toBeVisible();
    expect(screen.getByText('Client metadata')).toBeVisible();
  });

  it('uses clear target-object terminology in Chinese', async () => {
    const runtime = new I18nRuntime({
      defaultLocale: 'en-US',
      locales: ['en-US', 'zh-CN'],
    });
    runtime.registerNamespace('@nocobase/app-plugin-hub', locales);
    await runtime.init('zh-CN');

    render(
      <I18nProvider runtime={runtime}>
        <NamespaceScope ns='@nocobase/app-plugin-hub'>
          <MemoryRouter>
            <AuditPage />
          </MemoryRouter>
        </NamespaceScope>
      </I18nProvider>,
    );

    expect(
      screen.getByRole('columnheader', { name: '操作对象' }),
    ).toBeVisible();
    expect(screen.queryByLabelText('对象类型')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('对象 ID')).not.toBeInTheDocument();
  });
});

describe('MembersPage', () => {
  it('interpolates translated pagination values', async () => {
    const runtime = new I18nRuntime({
      defaultLocale: 'en-US',
      locales: ['en-US', 'zh-CN'],
    });
    runtime.registerNamespace('@nocobase/app-plugin-hub', locales);
    await runtime.init('zh-CN');

    render(
      <I18nProvider runtime={runtime}>
        <NamespaceScope ns='@nocobase/app-plugin-hub'>
          <MemoryRouter>
            <MembersPage />
          </MemoryRouter>
        </NamespaceScope>
      </I18nProvider>,
    );

    expect(screen.getByText('共 7 条记录')).toBeVisible();
    expect(screen.getByText('第 1 页，共 2 页')).toBeVisible();
    expect(screen.getByText('2026年8月31日')).toBeVisible();
  });

  it('provides all four tabs and member/invitation/credential actions', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    render(
      <MemoryRouter>
        <MembersPage />
      </MemoryRouter>,
    );

    for (const tab of [
      'Members',
      'Invitations',
      'Agent credentials',
      'Built-in roles',
    ]) {
      expect(screen.getByRole('tab', { name: tab })).toBeVisible();
    }

    await user.click(screen.getByRole('button', { name: 'Invite member' }));
    await user.type(screen.getByLabelText('Email'), 'new.member@example.test');
    expect(
      within(screen.getByLabelText('Role')).getByRole('option', {
        name: 'Administrator',
      }),
    ).toBeVisible();
    expect(
      within(screen.getByLabelText('Role')).queryByRole('option', {
        name: 'Developer',
      }),
    ).not.toBeInTheDocument();
    await user.selectOptions(
      screen.getByLabelText('Access scope'),
      'warehouse',
    );
    expect(
      within(screen.getByLabelText('Role')).getByRole('option', {
        name: 'Developer',
      }),
    ).toBeVisible();
    expect(
      within(screen.getByLabelText('Role')).queryByRole('option', {
        name: 'Administrator',
      }),
    ).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Role'), 'developer');
    await user.click(screen.getByRole('button', { name: 'Send invitation' }));
    expect(
      screen.getByRole('heading', { name: 'Invitation ready' }),
    ).toBeVisible();
    const invitationLink = screen.getByLabelText('Invitation link');
    expect((invitationLink as HTMLInputElement).value).toEqual(
      expect.stringMatching(/\/hub\/invitations\/accept\?token=.+/),
    );
    await user.click(
      screen.getByRole('button', { name: 'Copy invitation link' }),
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringMatching(/\/hub\/invitations\/accept\?token=.+/),
    );
    await user.click(screen.getByRole('button', { name: 'Done' }));

    await user.click(screen.getByRole('tab', { name: 'Invitations' }));
    expect(screen.getByText('new.member@example.test')).toBeVisible();

    await user.click(screen.getByRole('tab', { name: 'Agent credentials' }));
    expect(
      screen.getByRole('button', {
        name: 'Revoke credential Release automation',
      }),
    ).toBeVisible();

    await user.click(screen.getByRole('tab', { name: 'Built-in roles' }));
    expect(screen.getByText('Administrator')).toBeVisible();
    expect(screen.getByText('Read-only access')).toBeVisible();
    const viewerCard = screen
      .getByRole('heading', { name: 'Viewer' })
      .closest('article');
    expect(viewerCard).not.toBeNull();
    expect(within(viewerCard as HTMLElement).getByText('Global')).toBeVisible();
    expect(
      within(viewerCard as HTMLElement).getByText('Application'),
    ).toBeVisible();
  });

  it('interpolates member names in permissions and row actions', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <MembersPage />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole('button', { name: 'Disable Avery Chen' }),
    ).toBeVisible();
    await user.click(
      screen.getByRole('button', { name: 'Edit access for Morgan Lee' }),
    );
    expect(
      screen.getByRole('dialog', { name: 'Access for Morgan Lee' }),
    ).toBeVisible();
    expect(
      screen.getByRole('checkbox', {
        name: 'Warehouse Management role Developer',
      }),
    ).toBeVisible();
  });

  it('traps keyboard focus and makes the background inert while a dialog is open', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <MemoryRouter>
        <MembersPage />
      </MemoryRouter>,
    );
    const appRoot = container;
    const trigger = screen.getByRole('button', { name: 'Invite member' });

    await user.click(trigger);

    expect(appRoot).toHaveAttribute('inert');
    const email = screen.getByLabelText('Email');
    expect(email).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(appRoot).not.toHaveAttribute('inert');
    expect(trigger).toHaveFocus();
  });
});

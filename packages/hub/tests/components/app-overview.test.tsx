import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import AppOverview from '../../client/features/apps/app-overview';
import { rememberDeployToken } from '../../client/features/apps/deploy-token';

vi.mock('@refinedev/core', () => ({
  useLink:
    () =>
    ({
      to,
      children,
      ...props
    }: React.ComponentProps<'a'> & { to: string }) => (
      <a href={to} {...props}>
        {children}
      </a>
    ),
}));

vi.mock('react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router')>()),
  useParams: () => ({ appId: 'crm' }),
}));

vi.mock('@nocobase/hub-release-management/client', () => ({
  useReleaseManagement: () => ({
    scopedOverview: {
      apps: [
        {
          id: 'crm',
          name: '客户管理',
          basePath: null,
          accessUrl: null,
          activeReleaseId: null,
          activeVersion: null,
          state: 'not-deployed',
          desiredState: 'running',
          runtimeState: 'stopped',
          lifecycleError: null,
          resources: [],
          releases: [],
        },
      ],
      deployments: [],
      lifecycleOperations: [],
    },
    busy: false,
    error: null,
    refresh: vi.fn(),
    runLifecycle: vi.fn(),
  }),
}));

describe('AppOverview', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.NOCOBASE_PORTAL_BASE = '/hub/';
    rememberDeployToken('crm', 'overview-deploy-token');
  });

  it('does not offer runtime controls before the first Release is active', () => {
    render(<AppOverview />);

    expect(screen.getByText('客户管理')).toBeVisible();
    expect(screen.getAllByText('未发布').length).toBeGreaterThan(0);
    expect(
      screen.queryByRole('button', { name: '重新启动' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: '停止运行' }),
    ).not.toBeInTheDocument();
  });

  it('opens a directly runnable deployment guide for an unpublished App', async () => {
    const user = userEvent.setup();
    render(<AppOverview />);

    await user.click(screen.getByRole('button', { name: '开发与部署' }));

    expect(
      screen.getByRole('heading', { name: '本地开发与部署' }),
    ).toBeVisible();
    expect(
      screen.queryByText(/部署命令已包含部署令牌/),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText('pnpm create @nocobase/app@latest crm', {
        exact: false,
      }),
    ).toBeVisible();
    expect(screen.getByText(/--token overview-deploy-token/)).toBeVisible();
  });
});

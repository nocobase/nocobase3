import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import AppOverview from '../../client/features/apps/app-overview';

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
});

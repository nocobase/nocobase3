import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ReleaseManagementDashboard } from '../../client/features/deployments/release-management-dashboard';
import type { ReleaseOverview } from '@nocobase/hub-release-management/types';

const overview: ReleaseOverview = {
  apps: [
    {
      id: 'orders',
      name: 'Orders',
      basePath: '/orders',
      accessUrl: 'https://apps.example.com/orders/',
      activeReleaseId: 'release-v2',
      activeVersion: '2.0.0',
      state: 'active',
      releases: [
        {
          appId: 'orders',
          id: 'release-v3',
          version: '3.0.0',
          createdAt: '2026-08-18T03:00:00.000Z',
          runtime: { healthPath: '/healthz' },
        },
        {
          appId: 'orders',
          id: 'release-v2',
          version: '2.0.0',
          createdAt: '2026-08-18T02:00:00.000Z',
          runtime: { healthPath: '/healthz' },
        },
      ],
    },
  ],
  deployments: [
    {
      id: 'deployment-blocked',
      idempotencyKey: 'agent-run-broken',
      appId: 'orders',
      releaseId: 'release-broken',
      kind: 'deploy',
      status: 'failed',
      changed: false,
      previousReleaseId: null,
      activeReleaseId: 'release-v2',
      activeVersion: '2.0.0',
      actor: { id: '1', name: 'Agent', role: 'root' },
      requestedAt: '2026-08-18T04:00:00.000Z',
      completedAt: '2026-08-18T04:00:01.000Z',
      error: { code: 'APP_READINESS_FAILED', message: 'returned 503' },
    },
  ],
};

describe('ReleaseManagementDashboard', () => {
  it('shows a failed deployment and confirms direct artifact deployment', async () => {
    const user = userEvent.setup();
    const onExecute = vi.fn();
    render(
      <ReleaseManagementDashboard
        overview={overview}
        onRefresh={vi.fn()}
        onExecute={onExecute}
      />,
    );

    expect(screen.getByText(/APP_READINESS_FAILED/)).toBeInTheDocument();
    expect(screen.getByText(/产物未接管流量/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '打开 App' })).toHaveAttribute(
      'href',
      'https://apps.example.com/orders/',
    );

    await user.click(screen.getByRole('button', { name: '部署此产物' }));
    expect(
      screen.getByRole('heading', { name: '确认部署构建产物' }),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: '开始部署' }));

    expect(onExecute).toHaveBeenCalledWith({
      appId: 'orders',
      releaseId: 'release-v3',
      kind: 'deploy',
    });
  });

  it('confirms rollback to a historical immutable artifact', async () => {
    const user = userEvent.setup();
    const onExecute = vi.fn();
    render(
      <ReleaseManagementDashboard
        overview={{
          ...overview,
          apps: [
            {
              ...overview.apps[0],
              activeReleaseId: 'release-v3',
              activeVersion: '3.0.0',
            },
          ],
        }}
        onRefresh={vi.fn()}
        onExecute={onExecute}
      />,
    );

    expect(screen.getAllByText('历史产物')).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: '回滚到此版本' }));
    expect(
      screen.getByRole('heading', { name: '确认回滚运行版本' }),
    ).toBeVisible();
    expect(screen.getByText(/成功后才切换流量/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: '确认回滚' }));

    expect(onExecute).toHaveBeenCalledWith({
      appId: 'orders',
      releaseId: 'release-v2',
      kind: 'rollback',
    });
  });
});

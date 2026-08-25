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
  it('shows a blocked candidate while preserving the active release and confirms a deployment', async () => {
    const user = userEvent.setup();
    const onExecute = vi.fn();
    const onDecide = vi.fn();
    render(
      <ReleaseManagementDashboard
        overview={overview}
        onRefresh={vi.fn()}
        onExecute={onExecute}
        onDecide={onDecide}
      />,
    );

    expect(screen.getAllByText('门禁拦截').length).toBeGreaterThan(0);
    expect(
      screen.getByText(/在线流量仍由 release-v2 承载/),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '打开 App' })).toHaveAttribute(
      'href',
      'https://apps.example.com/orders/',
    );

    await user.click(screen.getByRole('button', { name: '受控发布' }));
    expect(screen.getByRole('heading', { name: '提交发布审批' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: '提交审批' }));

    expect(onExecute).toHaveBeenCalledWith({
      appId: 'orders',
      releaseId: 'release-v3',
      kind: 'deploy',
    });
  });

  it('shows the persisted approval notification and lets a manager approve it', async () => {
    const user = userEvent.setup();
    const onDecide = vi.fn();
    render(
      <ReleaseManagementDashboard
        overview={{
          ...overview,
          approvals: [
            {
              id: 'approval-1',
              idempotencyKey: 'agent-release-crm-v3',
              appId: 'orders',
              releaseId: 'release-v3',
              kind: 'deploy',
              status: 'pending',
              requestedBy: { id: 'agent-1', name: 'CRM Agent', role: 'agent' },
              requestedAt: '2026-08-18T05:00:00.000Z',
              decidedBy: null,
              decidedAt: null,
              decisionComment: null,
              deploymentId: null,
              error: null,
            },
          ],
          notifications: [
            {
              id: 'approval-1:approval_requested',
              approvalId: 'approval-1',
              appId: 'orders',
              releaseId: 'release-v3',
              event: 'approval_requested',
              recipient: { id: 'manager', name: '发布管理员', role: 'root' },
              title: '发布申请待审批',
              body: 'orders / release-v3 已进入发布审批流程。',
              status: 'delivered',
              createdAt: '2026-08-18T05:00:00.000Z',
            },
          ],
        }}
        onRefresh={vi.fn()}
        onExecute={vi.fn()}
        onDecide={onDecide}
      />,
    );

    expect(screen.getAllByText('待审批').length).toBeGreaterThan(0);
    expect(screen.getByText('发布申请待审批')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '等待审批' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: '批准并发布' }));

    expect(onDecide).toHaveBeenCalledWith({
      approvalId: 'approval-1',
      decision: 'approve',
    });
  });
});

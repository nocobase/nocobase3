import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import AgentDeliveries from '../../client/features/deliveries/agent-deliveries';

const run = vi.fn();
const decide = vi.fn();

vi.mock('@nocobase/hub-release-management/client', async () => {
  const actual = await vi.importActual<
    typeof import('@nocobase/hub-release-management/client')
  >('@nocobase/hub-release-management/client');
  return {
    ...actual,
    useReleaseManagement: () => ({
      overview: {
        apps: [
          {
            id: 'crm',
            name: 'CRM',
            basePath: '/crm',
            accessUrl: '/crm/',
            activeReleaseId: 'release-v2',
            activeVersion: '2.0.0',
            state: 'active',
            resources: [],
            releases: [
              {
                appId: 'crm',
                id: 'release-v3',
                version: '3.0.0',
                createdAt: '2026-08-24T10:00:00.000Z',
                runtime: { healthPath: '/healthz' },
              },
              {
                appId: 'crm',
                id: 'release-v2',
                version: '2.0.0',
                createdAt: '2026-08-24T09:00:00.000Z',
                runtime: { healthPath: '/healthz' },
              },
            ],
          },
        ],
        deployments: [],
        approvals: [
          {
            id: 'approval-v3',
            idempotencyKey: 'agent-task-v3',
            appId: 'crm',
            releaseId: 'release-v3',
            kind: 'deploy',
            status: 'pending',
            requestedBy: { id: 'agent', name: 'CRM Agent', role: 'agent' },
            requestedAt: '2026-08-24T10:01:00.000Z',
            decidedBy: null,
            decidedAt: null,
            decisionComment: null,
            deploymentId: null,
            error: null,
          },
        ],
      },
      busy: false,
      error: null,
      refresh: vi.fn(),
      run,
      decide,
    }),
  };
});

describe('AgentDeliveries', () => {
  it('shows a real pending delivery and sends the approval decision', async () => {
    const user = userEvent.setup();
    render(<AgentDeliveries />);

    expect(
      screen.getByRole('heading', {
        name: '安全地把 App 新版本上线',
      }),
    ).toBeVisible();
    expect(screen.getByText('版本与发布')).toBeVisible();
    expect(screen.getByText('待我处理')).toBeVisible();
    expect(screen.getByText('待处理版本')).toBeVisible();
    expect(screen.getAllByText('待审批').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /当前在线/ })).toBeVisible();
    expect(screen.getAllByText('失败记录').length).toBeGreaterThan(0);
    expect(screen.getAllByText('release-v3').length).toBeGreaterThan(0);
    expect(screen.getByText('CRM Agent · agent')).toBeVisible();
    expect(screen.getByText('当前发布策略')).toBeVisible();
    expect(screen.getByText(/暂不包含测试环境与多环境晋级/)).toBeVisible();

    await user.click(screen.getByRole('button', { name: '批准并上线' }));
    expect(
      screen.getByRole('heading', { name: '批准 CRM v3.0.0 上线？' }),
    ).toBeVisible();
    await user.click(
      screen.getByRole('button', { name: '批准并上线', exact: true }),
    );
    expect(decide).toHaveBeenCalledWith({
      approvalId: 'approval-v3',
      decision: 'approve',
    });
  });
});

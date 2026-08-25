import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import SettingsHome from '../../client/features/settings/settings-home';
import type { ReleaseOverview } from '@nocobase/hub-release-management/types';

const refresh = vi.fn();
const state = vi.hoisted(() => ({
  overview: { apps: [], deployments: [] } as ReleaseOverview,
  busy: false,
  error: null as string | null,
  errorCode: null as string | null,
  errorStatus: null as number | null,
}));

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

vi.mock('@nocobase/hub-release-management/client', () => ({
  isReadinessBlocked: (deployment: ReleaseOverview['deployments'][number]) =>
    deployment.status === 'failed' &&
    deployment.error?.code === 'APP_READINESS_FAILED',
  useReleaseManagement: () => ({ ...state, refresh }),
}));

const overview: ReleaseOverview = {
  apps: [
    {
      id: 'crm',
      name: 'CRM',
      basePath: '/crm',
      accessUrl: '/crm/',
      activeReleaseId: 'release-v2',
      activeVersion: '2.0.0',
      state: 'active',
      releases: [
        {
          appId: 'crm',
          id: 'release-v2',
          version: '2.0.0',
          createdAt: '2026-08-23T04:00:00.000Z',
          runtime: { healthPath: '/healthz' },
        },
        {
          appId: 'crm',
          id: 'release-v1',
          version: '1.0.0',
          createdAt: '2026-08-22T04:00:00.000Z',
          runtime: { healthPath: '/healthz' },
        },
      ],
    },
  ],
  deployments: [
    {
      id: 'deployment-blocked',
      idempotencyKey: 'agent-run-broken',
      appId: 'crm',
      releaseId: 'release-broken',
      kind: 'deploy',
      status: 'failed',
      changed: false,
      previousReleaseId: 'release-v2',
      activeReleaseId: 'release-v2',
      activeVersion: '2.0.0',
      actor: { id: 'agent', name: 'CRM Agent', role: 'root' },
      requestedAt: '2026-08-23T05:00:00.000Z',
      completedAt: '2026-08-23T05:00:01.000Z',
      error: { code: 'APP_READINESS_FAILED', message: 'returned 503' },
    },
  ],
};

describe('SettingsHome', () => {
  beforeEach(() => {
    state.overview = overview;
    state.busy = false;
    state.error = null;
    state.errorCode = null;
    state.errorStatus = null;
    refresh.mockReset();
  });

  it('turns platform status into an actionable runtime overview', async () => {
    const user = userEvent.setup();
    render(<SettingsHome />);

    expect(screen.getByRole('heading', { name: '平台运行总览' })).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent('平台运行正常');
    expect(screen.getByLabelText('受管 App：1')).toBeVisible();
    expect(screen.getByLabelText('已上线：1')).toBeVisible();
    expect(screen.getByLabelText('不可变 Release：2')).toBeVisible();
    expect(screen.getByLabelText('历史失败记录：1')).toBeVisible();
    expect(screen.getByText('crm · release-broken')).toBeVisible();
    expect(screen.getAllByText('门禁拦截').length).toBeGreaterThan(0);
    expect(
      screen.getByRole('button', { name: /查看所有 App/ }),
    ).toHaveAttribute('href', '/apps');
    expect(
      screen.queryByRole('button', { name: /进入发布中心/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('三层管理边界')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '刷新平台状态' }));
    expect(refresh).toHaveBeenCalledOnce();
  });

  it('keeps Hub capabilities visible while explaining an App Host outage', () => {
    state.overview = { apps: [], deployments: [] };
    state.error = 'connect ECONNREFUSED 127.0.0.1:13000';
    state.errorCode = 'APP_HOST_UNAVAILABLE';
    state.errorStatus = 503;

    render(<SettingsHome />);

    expect(screen.getByRole('status')).toHaveTextContent('App Host 尚未连接');
    expect(screen.getAllByText('App Host 尚未连接')).toHaveLength(2);
    expect(screen.getByText('Hub 原生认证')).toBeVisible();
    expect(screen.getByText('Hub 控制面数据')).toBeVisible();
    expect(screen.getByText('App 清单与发布操作暂不可用')).toBeVisible();
    expect(screen.getByLabelText('受管 App：暂不可用')).toHaveTextContent('—');
  });

  it('does not report an App Host outage when the operator lacks permission', () => {
    state.overview = { apps: [], deployments: [] };
    state.error = '需要 Hub 管理员权限才能管理发布';
    state.errorCode = 'RELEASE_FORBIDDEN';
    state.errorStatus = 403;

    render(<SettingsHome />);

    expect(screen.getByRole('status')).toHaveTextContent(
      '当前账号没有发布管理权限',
    );
    expect(screen.queryByText('App Host 尚未连接')).not.toBeInTheDocument();
    expect(screen.getByText('状态受限')).toBeVisible();
    expect(
      screen.getByText('当前账号无权读取 App 清单和发布状态'),
    ).toBeVisible();
    expect(screen.getByLabelText('受管 App：暂不可用')).toHaveTextContent('—');
  });

  it('provides a direct action when an app is not running', () => {
    state.overview = {
      ...overview,
      apps: overview.apps.map((app) => ({
        ...app,
        activeReleaseId: null,
        activeVersion: null,
        state: 'stopped' as const,
      })),
    };

    render(<SettingsHome />);

    expect(screen.getByRole('status')).toHaveTextContent('1 个 App 尚未上线');
    expect(
      screen.getByRole('button', { name: /查看未上线 App/ }),
    ).toHaveAttribute('href', '/apps');
  });

  it('treats an idle App with an active Release as deployed', () => {
    state.overview = {
      ...overview,
      apps: overview.apps.map((app) => ({ ...app, state: 'idle' as const })),
    };

    render(<SettingsHome />);

    expect(screen.getByRole('status')).toHaveTextContent('平台运行正常');
    expect(screen.getByLabelText('已上线：1')).toBeVisible();
    expect(screen.queryByText(/尚未上线/)).not.toBeInTheDocument();
  });
});

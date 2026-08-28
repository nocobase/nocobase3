import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import AppsHome from '../../client/features/apps/apps-home';

const state = vi.hoisted(() => ({
  error: null as string | null,
  errorCode: null as string | null,
  errorStatus: null as number | null,
  empty: false,
  stopped: false,
  runLifecycle: vi.fn(),
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
  useReleaseManagement: () => ({
    overview: {
      apps: state.empty
        ? []
        : [
            {
              id: 'orders',
              name: '订单运营中心',
              basePath: '/orders',
              accessUrl: '/orders/',
              activeReleaseId: 'release-v2',
              activeVersion: '2.0.0',
              state: state.stopped ? 'stopped' : 'active',
              desiredState: state.stopped ? 'stopped' : 'running',
              runtimeState: state.stopped ? 'stopped' : 'active',
              lifecycleError: null,
              releases: [
                {
                  appId: 'orders',
                  id: 'release-v2',
                  version: '2.0.0',
                  createdAt: '2026-08-18T02:00:00.000Z',
                  runtime: {},
                },
              ],
            },
          ],
      deployments: [],
      lifecycleOperations: [],
    },
    busy: false,
    error: state.error,
    errorCode: state.errorCode,
    errorStatus: state.errorStatus,
    refresh: vi.fn(),
    runLifecycle: state.runLifecycle,
  }),
}));

describe('AppsHome', () => {
  beforeEach(() => {
    state.error = null;
    state.errorCode = null;
    state.errorStatus = null;
    state.empty = false;
    state.stopped = false;
    state.runLifecycle.mockReset();
  });

  it('shows a real start action and disables access for a stopped App', () => {
    state.stopped = true;

    render(<AppsHome />);

    expect(screen.getAllByText('已停止').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'App 已停止' })).toBeDisabled();
    screen.getByRole('button', { name: '启动 App' }).click();
    expect(state.runLifecycle).toHaveBeenCalledWith({
      appId: 'orders',
      action: 'start',
    });
  });

  it('shows App Host inventory and links into the App management scope', () => {
    render(<AppsHome />);

    expect(screen.getByText('订单运营中心')).toBeVisible();
    expect(screen.getAllByText('运行中').length).toBeGreaterThan(0);
    expect(screen.getByLabelText('已部署：1')).toBeVisible();
    expect(screen.getByLabelText('构建产物：1')).toBeVisible();
    expect(screen.getByRole('heading', { name: '企业应用' })).toBeVisible();
    expect(screen.getByRole('button', { name: '管理' })).toHaveAttribute(
      'href',
      '/apps/orders',
    );
    expect(screen.getByRole('button', { name: '打开 App' })).toHaveAttribute(
      'href',
      '/orders/',
    );
    expect(screen.queryByText('App Host 实际发现')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: '登记应用' }),
    ).not.toBeInTheDocument();
  });

  it('keeps deployment guidance available when Apps already exist', () => {
    render(<AppsHome />);

    fireEvent.click(screen.getByRole('button', { name: '部署 App' }));

    expect(
      screen.getByRole('dialog', { name: '部署 App 到 Hub' }),
    ).toBeVisible();
    expect(screen.getByRole('tab', { name: '还没有本地 App' })).toBeVisible();

    fireEvent.click(screen.getByRole('tab', { name: '已有本地 App' }));

    const existingGuide = screen.getByRole('tabpanel', {
      name: '已有本地 App',
    });
    expect(existingGuide).toHaveTextContent('cd /path/to/your-app');
    expect(existingGuide).toHaveTextContent(
      'pnpm run deploy --hub http://localhost:3000/your-app-id',
    );
  });

  it('does not turn a permission failure into an empty App inventory', () => {
    state.error = '需要 Hub 管理员权限才能管理发布';
    state.errorCode = 'RELEASE_FORBIDDEN';
    state.errorStatus = 403;

    render(<AppsHome />);

    expect(screen.getByText('当前账号没有部署管理权限')).toBeVisible();
    expect(screen.getByLabelText('应用总数：暂不可用')).toHaveTextContent('—');
    expect(screen.getByText('应用清单暂不可用')).toBeVisible();
    expect(screen.queryByText('暂无应用')).not.toBeInTheDocument();
  });

  it('guides both new and existing local Apps into the empty Hub', () => {
    state.empty = true;
    render(<AppsHome />);

    expect(screen.getByText('部署 App 到 Hub')).toBeVisible();
    const createGuide = screen.getByRole('tabpanel', {
      name: '还没有本地 App',
    });
    expect(createGuide).toHaveTextContent(
      'pnpm --config.registry=https://npm.nocobase.ai create @nocobase/app@latest my-app',
    );
    expect(createGuide).toHaveTextContent('cd my-app');
    expect(createGuide).toHaveTextContent('pnpm dev');
    expect(createGuide).toHaveTextContent(
      'pnpm run deploy --hub http://localhost:3000/my-app',
    );
    expect(screen.getByText(/以下为示例命令，可复制后/)).toBeVisible();

    fireEvent.click(screen.getByRole('tab', { name: '已有本地 App' }));

    const existingGuide = screen.getByRole('tabpanel', {
      name: '已有本地 App',
    });
    expect(existingGuide).toHaveTextContent('cd /path/to/your-app');
    expect(existingGuide).toHaveTextContent(
      'pnpm run deploy --hub http://localhost:3000/your-app-id',
    );
    expect(screen.getByText(/首次合法产物上传成功后/)).toBeVisible();
    expect(
      screen.getByText(/源码仍由本地 Git、GitHub 或 GitLab 管理/),
    ).toBeVisible();
  });
});

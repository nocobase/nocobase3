import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import AppsHome from '../../client/features/apps/apps-home';

const state = vi.hoisted(() => ({
  error: null as string | null,
  errorCode: null as string | null,
  errorStatus: null as number | null,
  stopped: false,
  inventory: 'deployed' as 'deployed' | 'empty' | 'placeholder',
  createManagedApp: vi.fn(),
  refresh: vi.fn(),
  runLifecycle: vi.fn(),
}));

const deployedApp = {
  id: 'orders',
  name: '订单运营中心',
  basePath: '/orders',
  accessUrl: '/orders/',
  activeReleaseId: 'release-v2',
  activeVersion: '2.0.0',
  state: 'active',
  desiredState: 'running',
  runtimeState: 'active',
  lifecycleError: null,
  resources: [],
  releases: [
    {
      appId: 'orders',
      id: 'release-v2',
      version: '2.0.0',
      createdAt: '2026-08-18T02:00:00.000Z',
      runtime: {},
    },
  ],
};

const placeholderApp = {
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
};

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
  createManagedApp: state.createManagedApp,
  useReleaseManagement: () => ({
    overview: {
      apps:
        state.inventory === 'empty'
          ? []
          : state.inventory === 'placeholder'
            ? [placeholderApp]
            : [
                {
                  ...deployedApp,
                  state: state.stopped ? 'stopped' : 'active',
                  desiredState: state.stopped ? 'stopped' : 'running',
                  runtimeState: state.stopped ? 'stopped' : 'active',
                },
              ],
      deployments: [],
      lifecycleOperations: [],
    },
    busy: false,
    error: state.error,
    errorCode: state.errorCode,
    errorStatus: state.errorStatus,
    refresh: state.refresh,
    runLifecycle: state.runLifecycle,
  }),
}));

describe('AppsHome', () => {
  beforeEach(() => {
    state.error = null;
    state.errorCode = null;
    state.errorStatus = null;
    state.stopped = false;
    state.inventory = 'deployed';
    state.createManagedApp.mockReset();
    state.refresh.mockReset();
    state.runLifecycle.mockReset();
    window.NOCOBASE_PORTAL_BASE = '/hub/';
  });

  it('opens an accessible form and rejects an unsafe App ID', async () => {
    const user = userEvent.setup();
    render(<AppsHome />);

    await user.click(screen.getByRole('button', { name: '创建应用' }));

    expect(screen.getByRole('heading', { name: '创建空应用' })).toBeVisible();
    await user.type(
      screen.getByRole('textbox', { name: '应用名称' }),
      '客户管理',
    );
    await user.type(screen.getByRole('textbox', { name: 'App ID' }), '../crm');
    await user.click(screen.getByRole('button', { name: '创建空应用' }));

    expect(screen.getByText(/App ID 只能包含/)).toBeVisible();
    expect(state.createManagedApp).not.toHaveBeenCalled();

    await user.clear(screen.getByRole('textbox', { name: 'App ID' }));
    await user.type(screen.getByRole('textbox', { name: 'App ID' }), 'hub');
    await user.click(screen.getByRole('button', { name: '创建空应用' }));

    expect(screen.getByText('App ID “hub” 已由平台保留。')).toBeVisible();
    expect(state.createManagedApp).not.toHaveBeenCalled();

    await user.clear(screen.getByRole('textbox', { name: 'App ID' }));
    await user.type(screen.getByRole('textbox', { name: 'App ID' }), 'crm.v2');
    await user.click(screen.getByRole('button', { name: '创建空应用' }));

    expect(screen.getByText(/App ID 只能包含/)).toBeVisible();
    expect(state.createManagedApp).not.toHaveBeenCalled();
  });

  it('creates an App, refreshes inventory, and shows copyable development and deployment guides', async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText');
    state.createManagedApp.mockResolvedValue({
      app: { appId: 'crm', name: '客户管理' },
      deployToken: 'deploy-token-once',
    });
    render(<AppsHome />);

    await user.click(screen.getByRole('button', { name: '创建应用' }));
    await user.type(
      screen.getByRole('textbox', { name: '应用名称' }),
      '客户管理',
    );
    await user.type(screen.getByRole('textbox', { name: 'App ID' }), 'crm');
    await user.click(screen.getByRole('button', { name: '创建空应用' }));

    expect(state.createManagedApp).toHaveBeenCalledWith({
      appId: 'crm',
      name: '客户管理',
    });
    expect(state.refresh).toHaveBeenCalledOnce();
    expect(
      await screen.findByRole('heading', { name: '应用创建成功' }),
    ).toBeVisible();
    expect(screen.getByText(/只预留了 App ID/)).toBeVisible();
    expect(screen.getByText(/部署令牌只显示这一次/)).toBeVisible();
    expect(screen.getByText('deploy-token-once')).toBeVisible();

    const localCommands = [
      'nb3 app create crm',
      'cd crm',
      'pnpm install',
      'nb3 app dev',
    ].join('\n');
    const deployCommand = `(printf 'Deploy token: '; read -r -s NB3_HUB_TOKEN && export NB3_HUB_TOKEN && printf '\\n' && nb3 app deploy --hub '${window.location.origin}/hub'; NB3_DEPLOY_EXIT=$?; unset NB3_HUB_TOKEN; exit "$NB3_DEPLOY_EXIT")`;
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === 'PRE' && element.textContent === localCommands,
      ),
    ).toBeVisible();
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === 'PRE' && element.textContent === deployCommand,
      ),
    ).toBeVisible();
    expect(deployCommand).not.toContain('/crm');
    expect(deployCommand).not.toContain('deploy-token-once');
    for (const command of screen.getAllByText((_, element) => {
      return element?.tagName === 'PRE';
    })) {
      expect(command).not.toHaveTextContent('deploy-token-once');
    }

    await user.click(screen.getByRole('button', { name: '复制开发命令' }));
    expect(writeText).toHaveBeenLastCalledWith(localCommands);
    await user.click(screen.getByRole('button', { name: '复制部署令牌' }));
    expect(writeText).toHaveBeenLastCalledWith('deploy-token-once');
    await user.click(screen.getByRole('button', { name: '复制部署命令' }));
    expect(writeText).toHaveBeenLastCalledWith(deployCommand);
  });

  it('keeps the one-time token visible until explicit confirmation and clears it before reopening', async () => {
    const user = userEvent.setup();
    state.createManagedApp.mockResolvedValue({
      app: { appId: 'crm', name: '客户管理' },
      deployToken: 'deploy-token-once',
    });
    render(<AppsHome />);

    await user.click(screen.getByRole('button', { name: '创建应用' }));
    await user.type(
      screen.getByRole('textbox', { name: '应用名称' }),
      '客户管理',
    );
    await user.type(screen.getByRole('textbox', { name: 'App ID' }), 'crm');
    await user.click(screen.getByRole('button', { name: '创建空应用' }));
    expect(
      await screen.findByRole('heading', { name: '应用创建成功' }),
    ).toBeVisible();

    expect(
      screen.queryByRole('button', { name: 'Close' }),
    ).not.toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.getByText('deploy-token-once')).toBeVisible();

    const overlay = document.querySelector<HTMLElement>(
      '[data-slot="dialog-overlay"]',
    );
    expect(overlay).not.toBeNull();
    await user.click(overlay!);
    expect(screen.getByText('deploy-token-once')).toBeVisible();

    await user.click(screen.getByRole('button', { name: '我已保存，完成' }));
    expect(
      screen.queryByRole('heading', { name: '应用创建成功' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('deploy-token-once')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '创建应用' }));
    expect(screen.getByRole('heading', { name: '创建空应用' })).toBeVisible();
    expect(screen.queryByText('deploy-token-once')).not.toBeInTheDocument();
  });

  it('reopens the non-sensitive development guide after the creation dialog closes', async () => {
    const user = userEvent.setup();
    state.inventory = 'placeholder';
    state.createManagedApp.mockResolvedValue({
      app: { appId: 'crm', name: '客户管理' },
      deployToken: 'deploy-token-once',
    });
    render(<AppsHome />);

    await user.click(screen.getByRole('button', { name: '创建应用' }));
    await user.type(
      screen.getByRole('textbox', { name: '应用名称' }),
      '客户管理',
    );
    await user.type(screen.getByRole('textbox', { name: 'App ID' }), 'crm');
    await user.click(screen.getByRole('button', { name: '创建空应用' }));
    expect(
      await screen.findByRole('heading', { name: '应用创建成功' }),
    ).toBeVisible();

    await user.click(screen.getByRole('button', { name: '我已保存，完成' }));
    await user.click(screen.getByRole('button', { name: '开发与部署' }));

    expect(
      screen.getByRole('heading', { name: '本地开发与部署' }),
    ).toBeVisible();
    expect(screen.getByText(/部署令牌不会再次显示/)).toBeVisible();
    expect(
      screen.getByText('nb3 app create crm', { exact: false }),
    ).toBeVisible();
    expect(screen.queryByText('deploy-token-once')).not.toBeInTheDocument();
  });

  it('shows a duplicate App ID failure inside the dialog', async () => {
    const user = userEvent.setup();
    state.createManagedApp.mockRejectedValue(
      Object.assign(new Error('App already exists'), { status: 409 }),
    );
    render(<AppsHome />);

    await user.click(screen.getByRole('button', { name: '创建应用' }));
    await user.type(
      screen.getByRole('textbox', { name: '应用名称' }),
      '客户管理',
    );
    await user.type(screen.getByRole('textbox', { name: 'App ID' }), 'crm');
    await user.click(screen.getByRole('button', { name: '创建空应用' }));

    expect(
      await screen.findByText('这个 App ID 已存在，请换一个。'),
    ).toBeVisible();
    expect(state.refresh).not.toHaveBeenCalled();
  });

  it.each([
    [
      'a server failure',
      Object.assign(new Error('/private/data leaked'), { status: 500 }),
    ],
    ['an unknown failure', new Error('/private/data leaked')],
  ])('does not expose details from %s', async (_label, requestError) => {
    const user = userEvent.setup();
    state.createManagedApp.mockRejectedValue(requestError);
    render(<AppsHome />);

    await user.click(screen.getByRole('button', { name: '创建应用' }));
    await user.type(
      screen.getByRole('textbox', { name: '应用名称' }),
      '客户管理',
    );
    await user.type(screen.getByRole('textbox', { name: 'App ID' }), 'crm');
    await user.click(screen.getByRole('button', { name: '创建空应用' }));

    expect(await screen.findByText('创建请求失败，请稍后重试。')).toBeVisible();
    expect(screen.queryByText('/private/data leaked')).not.toBeInTheDocument();
  });

  it('presents a reserved App as not deployed without access or lifecycle actions', () => {
    state.inventory = 'placeholder';
    render(<AppsHome />);

    expect(screen.getByText('客户管理')).toBeVisible();
    expect(screen.getAllByText('未发布').length).toBeGreaterThan(0);
    expect(
      screen.queryByRole('button', { name: '打开 App' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: '重新启动' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: '停止运行' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: '启动 App' }),
    ).not.toBeInTheDocument();
  });

  it('points the empty inventory to App creation', () => {
    state.inventory = 'empty';
    render(<AppsHome />);

    expect(screen.getByText('暂无应用')).toBeVisible();
    expect(screen.getAllByRole('button', { name: '创建应用' })).toHaveLength(2);
    expect(screen.getByText(/创建一个空应用/)).toBeVisible();
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
    expect(screen.getByLabelText('已发布：1')).toBeVisible();
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
  });

  it('does not turn a permission failure into an empty App inventory', () => {
    state.error = '需要 Hub 管理员权限才能管理发布';
    state.errorCode = 'RELEASE_FORBIDDEN';
    state.errorStatus = 403;

    render(<AppsHome />);

    expect(screen.getByText('当前账号没有发布管理权限')).toBeVisible();
    expect(screen.getByLabelText('应用总数：暂不可用')).toHaveTextContent('—');
    expect(screen.getByText('应用清单暂不可用')).toBeVisible();
    expect(screen.queryByText('暂无应用')).not.toBeInTheDocument();
  });
});

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import AppResourceBindings from '../../client/features/apps/app-resource-bindings';

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

describe('AppResourceBindings', () => {
  it('presents current resource state without implying missing user configuration', () => {
    render(
      <MemoryRouter>
        <AppResourceBindings appId='service-desk' appName='Service Desk' />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: '运行资源' })).toBeVisible();
    expect(
      screen.getByRole('region', { name: 'Service Desk 运行资源状态' }),
    ).toBeVisible();
    expect(screen.getByText('文件存储')).toBeVisible();
    expect(screen.getByText('文件模块')).toBeVisible();
    expect(screen.getByText('数据库配置暂不可用')).toBeVisible();
    expect(screen.getByText('4 项配置入口暂未开放')).toBeVisible();
    expect(screen.getAllByText('暂不可配置')).toHaveLength(4);
    expect(screen.getAllByText('暂未开放')).toHaveLength(4);
    expect(screen.queryByText('未绑定')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('本地目录')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: '保存配置' }),
    ).not.toBeInTheDocument();
  });

  it('shows the primary database reported by the App Runtime', () => {
    render(
      <MemoryRouter>
        <AppResourceBindings
          appId='crm'
          appName='CRM'
          accessUrl='http://127.0.0.1:13200/crm/'
          runtimeResources={[
            {
              id: 'database:primary',
              kind: 'database',
              name: 'CRM 主数据库',
              status: 'active',
              provider: '@nocobase/app-database',
              updatedAt: '2026-08-23T12:00:00.000Z',
              details: {
                connectionName: 'sqlite',
                dialect: 'sqlite',
                driver: 'better-sqlite3',
              },
              error: null,
            },
          ]}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText('主数据库已接通')).toBeVisible();
    expect(screen.getByText('CRM 主数据库')).toBeVisible();
    expect(screen.getByText('SQLite · better-sqlite3')).toBeVisible();
    expect(screen.getByText('1 项已生效')).toBeVisible();
    expect(screen.getByText('4 项配置入口暂未开放')).toBeVisible();
    expect(screen.getAllByText('暂不可配置')).toHaveLength(3);
    expect(screen.getAllByText('暂未开放')).toHaveLength(4);
    expect(screen.getByText(/当前版本暂不提供连接切换或编辑/)).toBeVisible();
    expect(
      screen.getByRole('button', { name: /查看真实数据/ }),
    ).toHaveAttribute(
      'href',
      'http://127.0.0.1:13200/crm/settings/data-sources',
    );
    expect(screen.queryByText(/crm\.sqlite/)).not.toBeInTheDocument();
  });

  it('keeps implementation details in an optional guide', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <AppResourceBindings appId='crm' appName='CRM' />
      </MemoryRouter>,
    );

    const trigger = screen.getByRole('button', {
      name: /了解运行资源/,
    });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await user.click(trigger);

    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('heading', { name: '状态说明' })).toBeVisible();
    expect(screen.getByRole('heading', { name: '接入流程' })).toBeVisible();
    expect(screen.getByText('App 选择资源')).toBeVisible();
  });
});

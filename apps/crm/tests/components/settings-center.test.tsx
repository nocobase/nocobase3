import { render, screen } from '@testing-library/react';
import { createAppClient } from '@nocobase/app-sdk';
import {
  AppSettingsCenter,
  AppSettingsModuleContent,
  getAppSettingsConfiguration,
  getOrCreateAppSettingsModuleRegistry,
} from '@nocobase/app-plugin-settings/client';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';

import { configureCrmSettings } from '../../client/app/settings';

function createCrmSettingsRegistry() {
  const client = createAppClient({ fetch: async () => new Response() });
  configureCrmSettings(client);
  return {
    configuration: getAppSettingsConfiguration(client),
    registry: getOrCreateAppSettingsModuleRegistry(client),
  };
}

describe('SettingsCenter', () => {
  it('distinguishes connected settings from capability placeholders', () => {
    const { configuration, registry } = createCrmSettingsRegistry();
    render(
      <MemoryRouter>
        <AppSettingsCenter
          basePath={configuration.basePath}
          modules={registry.list()}
        />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole('heading', { name: '管理 App 内部能力' }),
    ).toBeVisible();
    expect(screen.getByText('用户与组织')).toBeVisible();
    expect(screen.getByText('角色')).toBeVisible();
    expect(screen.getByText('权限')).toBeVisible();
    expect(screen.getByText('知识库')).toBeVisible();
    expect(screen.getByText('工作流')).toBeVisible();
    expect(screen.getByText('数据源')).toBeVisible();
    expect(screen.getByText('文件存储')).toBeVisible();
    expect(screen.getByText('通知')).toBeVisible();
    expect(screen.getByText('App 基础设置')).toBeVisible();
    expect(screen.getByText('这里是能力地图，不是模拟后台')).toBeVisible();
    expect(screen.getAllByRole('link', { name: /进入设置/ })).toHaveLength(4);
    expect(screen.getAllByRole('link', { name: /查看说明/ })).toHaveLength(5);
    expect(
      screen.queryByRole('button', { name: '保存配置' }),
    ).not.toBeInTheDocument();
  });

  it('keeps a stable detail route for registered settings modules', () => {
    const { configuration, registry } = createCrmSettingsRegistry();
    render(
      <MemoryRouter>
        <AppSettingsModuleContent
          basePath={configuration.basePath}
          module={registry.get('files')}
        />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole('heading', { level: 1, name: '文件存储' }),
    ).toBeVisible();
    expect(screen.getByText('文件模块')).toBeVisible();
    expect(
      screen.getByText(
        '存储驱动和文件业务能力属于文件模块，不在 App 内重复实现。',
      ),
    ).toBeVisible();
    expect(screen.queryByRole('button', { name: '保存配置' })).toBeNull();
  });

  it('shows a clear fallback for an unregistered settings module', () => {
    const { configuration } = createCrmSettingsRegistry();
    render(
      <MemoryRouter>
        <AppSettingsModuleContent
          basePath={configuration.basePath}
          module={undefined}
        />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole('heading', { name: '未找到设置模块' }),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: '返回设置中心' })).toHaveAttribute(
      'href',
      '/settings',
    );
  });
});

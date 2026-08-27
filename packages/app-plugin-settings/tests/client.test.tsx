import { createAppClient } from '@nocobase/app-sdk';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';

import bootstrap from '../client/bootstrap.js';
import { AppSettingsCenter } from '../client/settings-center.js';
import { AppSettingsModuleContent } from '../client/module-content.js';
import {
  createDefaultAppSettingsModuleRegistry,
  getOrCreateAppSettingsModuleRegistry,
} from '../client/registry.js';
import routes from '../client/routes.js';

describe('@nocobase/app-plugin-settings client', () => {
  it('contributes standalone authenticated settings routes', () => {
    expect(routes).toMatchObject([
      { path: '/settings', auth: 'required', surface: 'standalone' },
      {
        path: '/settings/:moduleId',
        auth: 'required',
        surface: 'standalone',
      },
    ]);
  });

  it('bootstraps the shared settings registry', async () => {
    const appClient = createAppClient({ fetch: async () => new Response() });

    await bootstrap({
      appClient,
      packageName: '@nocobase/app-plugin-settings',
      source: 'plugin',
      refine: {} as never,
    });

    expect(getOrCreateAppSettingsModuleRegistry(appClient).list()).toHaveLength(
      9,
    );
  });

  it('renders the capability map without fake configuration actions', () => {
    const modules = createDefaultAppSettingsModuleRegistry().list();
    render(
      <MemoryRouter>
        <AppSettingsCenter modules={modules} />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole('heading', { name: '管理 App 内部能力' }),
    ).toBeVisible();
    expect(screen.getByText('工作流')).toBeVisible();
    expect(screen.getByText('知识库')).toBeVisible();
    expect(screen.getAllByRole('link', { name: /查看说明/ })).toHaveLength(9);
    expect(screen.queryByRole('button', { name: '保存配置' })).toBeNull();
  });

  it('renders a stable fallback for unknown modules', () => {
    render(
      <MemoryRouter>
        <AppSettingsModuleContent module={undefined} />
      </MemoryRouter>,
    );

    expect(screen.getByText('未找到设置模块')).toBeVisible();
    expect(screen.getByRole('link', { name: '返回设置中心' })).toHaveAttribute(
      'href',
      '/settings',
    );
  });
});

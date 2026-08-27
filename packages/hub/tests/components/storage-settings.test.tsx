import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import StorageSettings from '../../client/features/settings/storage-settings';

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

describe('StorageSettings', () => {
  it('presents App storage as a runtime resource without a settings landing page', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ data: null })),
    );
    render(
      <MemoryRouter>
        <StorageSettings
          appId='crm'
          appName='Crm'
          backLabel='返回 App 概览'
          backTo='/apps/crm'
        />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole('heading', { name: '文件存储' }),
    ).toBeVisible();
    expect(screen.getByText('App 运行资源')).toBeVisible();
    expect(
      screen.getByRole('button', { name: '返回 App 概览' }),
    ).toHaveAttribute('href', '/apps/crm');
    expect(screen.queryByText('App 设置')).not.toBeInTheDocument();
  });

  it('switches to S3 fields and prevents incomplete drafts from being saved', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ data: null })),
    );
    render(
      <MemoryRouter>
        <StorageSettings />
      </MemoryRouter>,
    );

    await screen.findByRole('button', { name: '保存配置' });

    await user.selectOptions(screen.getAllByRole('combobox')[0], 's3');

    expect(screen.getByPlaceholderText('my-app-files')).toBeVisible();
    expect(screen.getByRole('button', { name: '保存配置' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: '服务端校验' }));
    expect(await screen.findByText('请填写 Bucket')).toBeVisible();
  });
});

import { I18nRuntime } from '@nocobase/i18n';
import { I18nProvider } from '@nocobase/i18n/client';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import plugin from '../client/plugin.js';
import Page from '../client/pages/notification-demo-page.js';
const open = vi.hoisted(() => vi.fn());
vi.mock('@refinedev/core', () => ({ useNotification: () => ({ open }) }));
it('translates demo notifications and retranslates stored undo status', async () => {
  const definition = plugin();
  const runtime = new I18nRuntime({
    applicationNamespace: 'app',
    defaultLocale: 'en-US',
    locales: ['en-US', 'zh-CN'],
  });
  runtime.registerApplicationNamespace('app', {
    'en-US': async () => ({ default: {} }),
  });
  runtime.registerNamespace(definition.packageName, definition.locales ?? {});
  await runtime.init('zh-CN');
  render(
    <I18nProvider runtime={runtime}>
      <Page />
    </I18nProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: '显示成功通知' }));
  expect(open).toHaveBeenCalledWith(
    expect.objectContaining({
      message: '成功通知',
      description: '操作已成功完成。',
      type: 'success',
    }),
  );
  fireEvent.click(screen.getByRole('button', { name: '显示可撤销通知' }));
  expect(screen.getByRole('status')).toHaveTextContent('正在等待撤销请求。');
  await act(() => runtime.changeLanguage('en-US'));
  expect(screen.getByRole('status')).toHaveTextContent(
    'Waiting for an undo request.',
  );
});

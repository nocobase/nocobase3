import { I18nRuntime } from '@nocobase/i18n';
import { I18nProvider } from '@nocobase/i18n/client';
import { act, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import locales from '../client/locales/index.js';
import { NotificationLogsPage } from '../registry/logs-ui/page.js';

vi.mock('../registry/logs-ui/api.js', () => ({
  fetchNotificationLogs: async () => [],
}));

it('translates installed notification log source using the plugin resources', async () => {
  const runtime = new I18nRuntime({
    applicationNamespace: 'app',
    defaultLocale: 'en-US',
    locales: ['en-US', 'zh-CN'],
  });
  runtime.registerApplicationNamespace('app', {
    'en-US': async () => ({ default: {} }),
  });
  runtime.registerNamespace('@nocobase/app-plugin-notification', locales);
  await runtime.init('en-US');
  render(
    <I18nProvider runtime={runtime}>
      <NotificationLogsPage />
    </I18nProvider>,
  );
  await screen.findByText('No deliveries yet');
  await act(() => runtime.changeLanguage('zh-CN'));
  expect(screen.getByRole('heading', { name: '通知日志' })).toBeVisible();
  expect(screen.getByRole('button', { name: '刷新' })).toBeVisible();
  expect(screen.queryByText('No deliveries yet')).not.toBeInTheDocument();
});

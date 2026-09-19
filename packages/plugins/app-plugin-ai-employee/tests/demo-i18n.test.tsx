// @vitest-environment jsdom
import { I18nRuntime } from '@nocobase/i18n';
import { I18nProvider } from '@nocobase/i18n/client';
import { act, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import locales from '../client/locales/index.js';
import { ContainerShowcase } from '../client/dev/demo/container-showcase.js';
vi.mock('../registry/nocobase-ai/components/index.js', () => ({
  AIChatWindow: () => null,
  ChatInline: () => null,
  ChatPage: () => null,
}));
it('translates demo option metadata without changing container values', async () => {
  const runtime = new I18nRuntime({
    applicationNamespace: 'app',
    defaultLocale: 'en-US',
    locales: ['en-US', 'zh-CN'],
  });
  runtime.registerApplicationNamespace('app', {
    'en-US': async () => ({ default: {} }),
  });
  runtime.registerNamespace('@nocobase/app-plugin-ai-employee', locales);
  await runtime.init('zh-CN');
  render(
    <I18nProvider runtime={runtime}>
      <ContainerShowcase
        value='embedded'
        onValueChange={() => {}}
        windowProps={{}}
      />
    </I18nProvider>,
  );
  expect(screen.getByRole('button', { name: '预览区域' })).toBeVisible();
  expect(
    screen.getByText('将聊天放在仪表盘、记录页面或工作区内。'),
  ).toBeVisible();
  await act(() => runtime.changeLanguage('en-US'));
  expect(screen.getByRole('button', { name: 'Preview block' })).toBeVisible();
});

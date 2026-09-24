// @vitest-environment jsdom
import { I18nRuntime } from '@nocobase/i18n';
import { I18nProvider } from '@nocobase/i18n/client';
import { act, render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import locales from '../client/locales/index.js';
import routes from '../client/routes.js';
import { useAITranslate } from '../registry/nocobase-ai/locales/use-ai-translate.js';

function RegistryCopy() {
  const t = useAITranslate();
  return <h1>{t('demo.chat.title', 'AI Chat Window')}</h1>;
}

it('translates Registry copy with the active application language', async () => {
  const runtime = new I18nRuntime({
    applicationNamespace: 'app',
    defaultLocale: 'en-US',
    locales: ['en-US', 'zh-CN'],
  });
  runtime.registerApplicationNamespace('app', {
    'en-US': async () => ({ default: {} }),
    'zh-CN': async () => ({ default: {} }),
  });
  runtime.registerNamespace('@nocobase/app-plugin-ai-employee', locales);
  await runtime.init('zh-CN');
  render(
    <I18nProvider runtime={runtime}>
      <RegistryCopy />
    </I18nProvider>,
  );
  expect(screen.getByRole('heading')).toHaveTextContent('AI 聊天窗口');
  await act(() => runtime.changeLanguage('en-US'));
  expect(screen.getByRole('heading')).toHaveTextContent('AI Chat Window');
  await act(() => runtime.changeLanguage('zh-CN'));
  expect(screen.getByRole('heading')).toHaveTextContent('AI 聊天窗口');
});

it('resolves development navigation and breadcrumbs in the plugin namespace', async () => {
  const runtime = new I18nRuntime({
    applicationNamespace: 'app',
    defaultLocale: 'en-US',
    locales: ['en-US', 'zh-CN'],
  });
  runtime.registerApplicationNamespace('app', {
    'en-US': async () => ({ default: {} }),
  });
  const ns = '@nocobase/app-plugin-ai-employee';
  runtime.registerNamespace(ns, locales);
  await runtime.init('zh-CN');
  const dev = routes.find((item) => item.parent === 'dev');
  if (!dev || dev.parent !== 'dev') throw new Error('Missing dev routes');
  const group = dev.routes[0]!;
  const items = [group, ...group.children!];
  expect(
    items.map((item) => runtime.i18n.t(item.navigation!.title!, { ns })),
  ).toEqual([
    'AI 组件',
    '聊天窗口',
    '悬浮聊天',
    '员工任务',
    '页面上下文',
    '工具卡片',
  ]);
  expect(
    items.map((item) => runtime.i18n.t(item.breadcrumb!.title!, { ns })),
  ).toEqual([
    'AI 组件',
    '聊天窗口',
    '悬浮聊天',
    '员工任务',
    '页面上下文',
    '工具卡片',
  ]);
});

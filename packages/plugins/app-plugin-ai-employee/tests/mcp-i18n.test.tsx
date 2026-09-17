// @vitest-environment jsdom
import { I18nRuntime } from '@nocobase/i18n';
import { I18nProvider } from '@nocobase/i18n/client';
import { act, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import locales from '../client/locales/index.js';
import MCPPage from '../client/pages/mcp-page.js';

vi.mock('@nocobase/app-client', () => ({
  useApiClient: () => api,
}));
const api = {};
vi.mock('../client/mcp-service.js', () => ({
  listMCPServers: async () => [],
  listMCPTools: async () => ({}),
  updateMCPServerEnabled: vi.fn(),
  updateMCPToolPermission: vi.fn(),
}));

it('translates the MCP configuration notice and updates it when language changes', async () => {
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
      <MCPPage />
    </I18nProvider>,
  );
  expect(await screen.findByText('MCP 服务配置于 config.yml。')).toBeVisible();
  await act(() => runtime.changeLanguage('en-US'));
  expect(
    screen.getByText('MCP servers are configured in config.yml.'),
  ).toBeVisible();
});

// @vitest-environment jsdom
import { I18nRuntime } from '@nocobase/i18n';
import { I18nProvider, NamespaceScope } from '@nocobase/i18n/client';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import packageMetadata from '../package.json' with { type: 'json' };
import locales from '../client/locales/index.js';
import AIConversationsSettingsPage from '../client/pages/conversation-center-settings-page.js';
import {
  LLMServiceSettingsPage,
  MCPServiceSettingsPage,
} from '../client/settings-pages.js';

vi.mock('../client/pages/llm-service-page.js', () => ({
  default: () => <div>LLM content</div>,
}));
vi.mock('../client/pages/mcp-page.js', () => ({
  default: () => <div>MCP content</div>,
}));

vi.mock('../client/pages/conversation-center-page.js', () => ({
  default: () => <div>Conversations content</div>,
}));

describe('standalone settings translations', () => {
  it.each([
    [
      'en-US',
      'LLM services',
      'Manage LLM service status and available models. Connections are configured during deployment.',
      'MCP services',
      'Manage MCP service status and tool permissions. Connections are configured during deployment.',
      'Conversations',
      'Review all users’ conversations with AI employees, including messages and tool calls, without changing their read status.',
    ],
    [
      'zh-CN',
      'LLM 服务',
      '管理 LLM 服务状态和可用模型。服务连接在应用部署时配置。',
      'MCP 服务',
      '管理 MCP 服务状态和工具权限。服务连接在应用部署时配置。',
      '会话',
      '查看所有用户与 AI 员工的会话、消息和工具调用记录，不改变会话的已读状态。',
    ],
  ])(
    'renders plugin-owned headings without a router or tabs in %s',
    async (
      locale,
      llmTitle,
      llmDescription,
      mcpTitle,
      mcpDescription,
      conversationsTitle,
      conversationsDescription,
    ) => {
      const runtime = new I18nRuntime({
        defaultLocale: 'en-US',
        locales: ['en-US', 'zh-CN'],
        applicationNamespace: '@test/app',
      });
      runtime.registerApplicationNamespace('@test/app', {
        'en-US': async () => ({
          default: { 'LLM services': 'Wrong namespace' },
        }),
        'zh-CN': async () => ({
          default: { 'LLM services': 'Wrong namespace' },
        }),
      });
      runtime.registerNamespace(packageMetadata.name, locales);
      await runtime.init(locale);

      for (const [Page, title, description, content] of [
        [LLMServiceSettingsPage, llmTitle, llmDescription, 'LLM content'],
        [MCPServiceSettingsPage, mcpTitle, mcpDescription, 'MCP content'],
        [
          AIConversationsSettingsPage,
          conversationsTitle,
          conversationsDescription,
          'Conversations content',
        ],
      ] as const) {
        const view = render(
          <I18nProvider runtime={runtime}>
            <NamespaceScope ns='@test/app'>
              <Page />
            </NamespaceScope>
          </I18nProvider>,
        );
        expect(
          screen.getByRole('heading', { level: 1, name: title }),
        ).toBeInTheDocument();
        expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
        expect(screen.getByText(description)).toBeInTheDocument();
        expect(screen.getByText(content)).toBeInTheDocument();
        expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
        expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
        view.unmount();
      }
    },
  );
});

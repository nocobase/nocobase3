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
      'Manage LLM services.',
      'MCP services',
      'Manage MCP services.',
      'Conversations',
      'Review conversations across all users without changing their read status.',
    ],
    [
      'zh-CN',
      'LLM 服务',
      '管理 LLM 服务。',
      'MCP 服务',
      '管理 MCP 服务。',
      '会话',
      '查看所有用户的会话，不改变会话的已读状态。',
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

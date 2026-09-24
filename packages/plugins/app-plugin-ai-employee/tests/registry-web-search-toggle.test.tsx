// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ChatComposer } from '../registry/nocobase-ai/components/chat/chat-composer.js';
import { AIProvider } from '../registry/nocobase-ai/providers/ai-provider.js';
import { useAI } from '../registry/nocobase-ai/providers/ai-context.js';
import { useAIChat } from '../registry/nocobase-ai/providers/chat-context.js';
import { AIChatProvider } from '../registry/nocobase-ai/providers/chat-provider.js';
import type {
  AIEmployee,
  AIModel,
} from '../registry/nocobase-ai/providers/types.js';
import type { AIService } from '../registry/nocobase-ai/services/types.js';

const searching: AIModel = {
  value: 'searching-model',
  label: 'Searching',
  llmService: 'main',
  configured: true,
  supportWebSearch: true,
};
const plain: AIModel = {
  value: 'plain-model',
  label: 'Plain',
  llmService: 'main',
  configured: true,
  supportWebSearch: false,
};
const employee: AIEmployee = { username: 'order-desk', nickname: 'Order desk' };

function createService(models: AIModel[]): AIService & {
  sendMessagesStream: ReturnType<typeof vi.fn>;
} {
  return {
    listEmployees: vi.fn().mockResolvedValue([employee]),
    listModels: vi.fn().mockResolvedValue(models),
    updateEmployeeUserPrompt: vi.fn(),
    listConversations: vi.fn().mockResolvedValue([]),
    getConversationMessages: vi.fn().mockResolvedValue([]),
    getConversationActiveState: vi.fn().mockResolvedValue('idle'),
    updateConversationTitle: vi.fn(),
    destroyConversation: vi.fn(),
    uploadFile: vi.fn(),
    createConversation: vi.fn().mockResolvedValue('order-session'),
    sendMessagesStream: vi
      .fn()
      .mockImplementation(
        async () => new ReadableStream<Uint8Array>({ start: (c) => c.close() }),
      ),
    resendMessagesStream: vi.fn(),
    updateToolCallDecision: vi.fn(),
    resumeToolCallStream: vi.fn(),
    resumeConversationStream: vi.fn(),
  } as unknown as AIService & {
    sendMessagesStream: ReturnType<typeof vi.fn>;
  };
}

function Probe() {
  const chat = useAIChat();
  return (
    <div>
      <span data-testid='model'>{chat.currentModel.value}</span>
      <button
        type='button'
        onClick={() => chat.selectModel(`main:${plain.value}`)}
      >
        Use plain
      </button>
      <input
        aria-label='Draft'
        value={chat.draft}
        onChange={(event) => chat.setDraft(event.target.value)}
      />
      <button
        type='button'
        disabled={!chat.canSend}
        onClick={() => void chat.send()}
      >
        Send now
      </button>
    </div>
  );
}

function ReadyChat({
  webSearch,
  children,
}: {
  webSearch?: boolean;
  children: ReactNode;
}) {
  const { configurationStatus, employees, hasEnabledModels } = useAI();
  if (configurationStatus !== 'ready' || !employees.length || !hasEnabledModels)
    return null;
  return (
    <AIChatProvider
      id='web-search'
      defaultEmployee='order-desk'
      webSearch={webSearch}
    >
      <Probe />
      {children}
    </AIChatProvider>
  );
}

function mount(
  models: AIModel[],
  composer: ReactNode,
  webSearch?: boolean,
): ReturnType<typeof createService> {
  const service = createService(models);
  render(
    <AIProvider service={service}>
      <ReadyChat webSearch={webSearch}>{composer}</ReadyChat>
    </AIProvider>,
  );
  return service;
}

async function sendAndReadBody(
  service: ReturnType<typeof createService>,
): Promise<string> {
  fireEvent.change(screen.getByRole('textbox', { name: 'Draft' }), {
    target: { value: 'Find the latest price' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Send now' }));
  await waitFor(() => expect(service.sendMessagesStream).toHaveBeenCalled());
  return JSON.stringify(service.sendMessagesStream.mock.calls[0]?.[0]);
}

describe('the composer web search toggle', () => {
  it('is absent unless enableWebSearch is set', async () => {
    mount([searching], <ChatComposer />);
    await screen.findByTestId('model');

    expect(
      screen.queryByRole('button', { name: 'Web search' }),
    ).not.toBeInTheDocument();
  });

  it('starts off, and sends web search once switched on', async () => {
    const service = mount([searching], <ChatComposer enableWebSearch />);
    const toggle = await screen.findByRole('button', { name: 'Web search' });

    expect(toggle).toBeEnabled();
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');

    expect(await sendAndReadBody(service)).toContain('"webSearch":true');
  });

  it('is disabled on a model that cannot search', async () => {
    mount([plain], <ChatComposer enableWebSearch />);

    const toggle = await screen.findByRole('button', {
      name: 'Web search is not supported by this model',
    });
    expect(toggle).toBeDisabled();
  });

  it('switches off when the user moves to a model that cannot search', async () => {
    const service = mount([searching, plain], <ChatComposer enableWebSearch />);
    fireEvent.click(await screen.findByRole('button', { name: 'Web search' }));
    fireEvent.click(screen.getByRole('button', { name: 'Use plain' }));

    const toggle = await screen.findByRole('button', {
      name: 'Web search is not supported by this model',
    });
    expect(toggle).toBeDisabled();
    await waitFor(() =>
      expect(toggle).toHaveAttribute('aria-pressed', 'false'),
    );
    expect(await sendAndReadBody(service)).not.toContain('"webSearch":true');
  });

  it('leaves AIChatProvider.webSearch as it was when no toggle is mounted', async () => {
    const service = mount([plain], <ChatComposer />, true);
    await screen.findByTestId('model');

    expect(await sendAndReadBody(service)).toContain('"webSearch":true');
  });
});

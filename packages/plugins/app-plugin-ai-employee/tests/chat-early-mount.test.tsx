// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AIProvider } from '../registry/nocobase-ai/providers/ai-provider.js';
import { useAIChat } from '../registry/nocobase-ai/providers/chat-context.js';
import { AIChatProvider } from '../registry/nocobase-ai/providers/chat-provider.js';
import type { AIService } from '../registry/nocobase-ai/services/types.js';

function createService() {
  return {
    listEmployees: vi.fn().mockResolvedValue([
      { username: 'atlas', nickname: 'Atlas' },
      { username: 'order-desk', nickname: 'Order desk' },
    ]),
    listModels: vi.fn().mockResolvedValue([
      {
        value: 'general-model',
        label: 'General',
        llmService: 'main',
        configured: true,
      },
    ]),
    updateEmployeeUserPrompt: vi.fn(),
    listConversations: vi.fn().mockResolvedValue([]),
    getConversationMessages: vi.fn().mockResolvedValue([]),
    getConversationActiveState: vi.fn().mockResolvedValue('idle'),
    updateConversationTitle: vi.fn(),
    destroyConversation: vi.fn(),
    uploadFile: vi.fn(),
    createConversation: vi.fn().mockResolvedValue('early-session'),
    sendMessagesStream: vi
      .fn()
      .mockImplementation(
        async () => new ReadableStream<Uint8Array>({ start: (c) => c.close() }),
      ),
    resendMessagesStream: vi.fn(),
    updateToolCallDecision: vi.fn(),
    resumeToolCallStream: vi.fn(),
    resumeConversationStream: vi.fn(),
  };
}

function Probe() {
  const chat = useAIChat();
  return (
    <div>
      <span data-testid='employee'>{chat.currentEmployee.username}</span>
      <input
        aria-label='Message'
        value={chat.draft}
        onChange={(event) => chat.setDraft(event.target.value)}
      />
      <button type='button' onClick={() => void chat.send()}>
        Send
      </button>
    </div>
  );
}

describe('a chat mounted before the configuration loaded', () => {
  it('sends to its defaultEmployee once employees and models arrive', async () => {
    const service = createService();
    // No readiness gate: the chat exists before either list has loaded.
    render(
      <AIProvider service={service as unknown as AIService}>
        <AIChatProvider id='early' defaultEmployee='order-desk'>
          <Probe />
        </AIChatProvider>
      </AIProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId('employee')).toHaveTextContent('order-desk'),
    );
    fireEvent.change(screen.getByRole('textbox', { name: 'Message' }), {
      target: { value: 'Hello' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(service.sendMessagesStream).toHaveBeenCalled());
    expect(service.sendMessagesStream.mock.calls[0]?.[0]).toMatchObject({
      aiEmployee: 'order-desk',
      model: { llmService: 'main', model: 'general-model' },
    });
  });
});

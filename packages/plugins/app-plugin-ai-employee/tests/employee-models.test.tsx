// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AIProvider } from '../registry/nocobase-ai/providers/ai-provider.js';
import { useAI } from '../registry/nocobase-ai/providers/ai-context.js';
import { useAIChat } from '../registry/nocobase-ai/providers/chat-context.js';
import { AIChatProvider } from '../registry/nocobase-ai/providers/chat-provider.js';
import {
  getEmployeeModels,
  resolveEmployeeModel,
} from '../registry/nocobase-ai/providers/model.js';
import type {
  AIEmployee,
  AIModel,
} from '../registry/nocobase-ai/providers/types.js';
import type { AIService } from '../registry/nocobase-ai/services/types.js';

const general: AIModel = {
  value: 'general-model',
  label: 'General',
  llmService: 'main',
  configured: true,
};
const vision: AIModel = {
  value: 'vision-model',
  label: 'Vision',
  llmService: 'main',
  configured: true,
};
const fast: AIModel = {
  value: 'fast-model',
  label: 'Fast',
  llmService: 'gateway',
  configured: true,
};
const models = [general, vision, fast];

const restricted: AIEmployee = {
  username: 'order-desk',
  nickname: 'Order desk',
  modelSettings: {
    enabled: true,
    models: [
      { llmService: 'gateway', model: 'fast-model' },
      { llmService: 'main', model: 'vision-model' },
    ],
  },
};

describe('getEmployeeModels', () => {
  it("lists only the employee's models, in the employee's order", () => {
    expect(getEmployeeModels(models, restricted)).toEqual([fast, vision]);
  });

  it('reads the single-model form of the settings', () => {
    expect(
      getEmployeeModels(models, {
        username: 'legacy',
        modelSettings: {
          enabled: true,
          llmService: 'main',
          model: 'vision-model',
        },
      }),
    ).toEqual([vision]);
  });

  it('uses every model when the settings are off or name none that is enabled', () => {
    expect(
      getEmployeeModels(models, {
        ...restricted,
        modelSettings: { ...restricted.modelSettings, enabled: false },
      }),
    ).toEqual(models);
    expect(
      getEmployeeModels(models, {
        username: 'stale',
        modelSettings: {
          enabled: true,
          models: [{ llmService: 'main', model: 'removed-model' }],
        },
      }),
    ).toEqual(models);
    expect(getEmployeeModels(models, undefined)).toEqual(models);
  });

  it('keeps an allowed selection and replaces a disallowed one with the first allowed', () => {
    expect(resolveEmployeeModel(models, restricted, 'main:vision-model')).toBe(
      vision,
    );
    expect(resolveEmployeeModel(models, restricted, 'main:general-model')).toBe(
      fast,
    );
  });
});

function createService(): AIService & {
  sendMessagesStream: ReturnType<typeof vi.fn>;
} {
  return {
    listEmployees: vi.fn().mockResolvedValue([restricted]),
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
      <span data-testid='models'>
        {chat.models.map((model) => model.value).join(',')}
      </span>
      <input
        aria-label='Message'
        value={chat.draft}
        onChange={(event) => chat.setDraft(event.target.value)}
      />
      <button
        type='button'
        disabled={!chat.canSend}
        onClick={() => void chat.send()}
      >
        Send
      </button>
    </div>
  );
}

/** Mounts the chat once configuration is ready, as the Skill's gate does. */
function ReadyChat() {
  const { configurationStatus, employees, hasEnabledModels } = useAI();
  if (configurationStatus !== 'ready' || !employees.length || !hasEnabledModels)
    return null;
  return (
    <AIChatProvider id='models' defaultEmployee='order-desk'>
      <Probe />
    </AIChatProvider>
  );
}

describe('the chat for an employee with its own models', () => {
  it('shows, offers and sends the model the server will run', async () => {
    const service = createService();
    render(
      <AIProvider service={service}>
        <ReadyChat />
      </AIProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId('model')).toHaveTextContent('fast-model'),
    );
    expect(screen.getByTestId('models')).toHaveTextContent(
      'fast-model,vision-model',
    );

    fireEvent.change(screen.getByRole('textbox', { name: 'Message' }), {
      target: { value: 'Hello' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(service.sendMessagesStream).toHaveBeenCalled());
    const body = JSON.stringify(service.sendMessagesStream.mock.calls[0]?.[0]);
    expect(body).toContain('fast-model');
    expect(body).not.toContain('general-model');
  });
});

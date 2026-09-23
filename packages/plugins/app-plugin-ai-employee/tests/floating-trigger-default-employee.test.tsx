// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AIChatFloatingTrigger } from '../registry/nocobase-ai/components/triggers/ai-chat-floating-trigger.js';
import { AIProvider } from '../registry/nocobase-ai/providers/ai-provider.js';
import { useAIChat } from '../registry/nocobase-ai/providers/chat-context.js';
import { useAIChatController } from '../registry/nocobase-ai/providers/chat-controller.js';
import { AIChatProvider } from '../registry/nocobase-ai/providers/chat-provider.js';
import type {
  AIEmployee,
  AIModel,
} from '../registry/nocobase-ai/providers/types.js';
import type { AIService } from '../registry/nocobase-ai/services/types.js';

// The built-in router sorts first, as it does in a real application.
const employees: AIEmployee[] = [
  { username: 'atlas', nickname: 'Atlas' },
  { username: 'order-desk', nickname: 'Order desk' },
];
const models: AIModel[] = [
  {
    value: 'test-model',
    label: 'Test model',
    llmService: 'test-service',
    configured: true,
  },
];

function createService(): AIService {
  return {
    listEmployees: vi.fn().mockResolvedValue(employees),
    listModels: vi.fn().mockResolvedValue(models),
    updateEmployeeUserPrompt: vi.fn(),
    listConversations: vi.fn().mockResolvedValue([]),
    getConversationMessages: vi.fn().mockResolvedValue([]),
    getConversationActiveState: vi.fn().mockResolvedValue('idle'),
    updateConversationTitle: vi.fn(),
    destroyConversation: vi.fn(),
    uploadFile: vi.fn(),
    createConversation: vi.fn(),
    sendMessagesStream: vi.fn(),
    resendMessagesStream: vi.fn(),
    updateToolCallDecision: vi.fn(),
    resumeToolCallStream: vi.fn(),
    resumeConversationStream: vi.fn(),
  } as unknown as AIService;
}

function CurrentEmployee() {
  const chat = useAIChat();
  return <span data-testid='employee'>{chat.currentEmployee.username}</span>;
}

/** A floating trigger beside the chat, sharing only its controller. */
function Page({ triggerEmployee }: { triggerEmployee?: string }) {
  const controller = useAIChatController();
  return (
    <AIProvider service={createService()}>
      <AIChatProvider
        id='floating'
        controller={controller}
        defaultEmployee='order-desk'
      >
        <CurrentEmployee />
      </AIChatProvider>
      <AIChatFloatingTrigger
        controller={controller}
        {...(triggerEmployee ? { aiEmployee: triggerEmployee } : {})}
      />
    </AIProvider>
  );
}

async function openFromTrigger() {
  await waitFor(() =>
    expect(screen.getByTestId('employee')).toHaveTextContent('order-desk'),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Open AI chat' }));
}

describe('AIChatFloatingTrigger', () => {
  it("opens on the chat's defaultEmployee when it names none of its own", async () => {
    render(<Page />);

    await openFromTrigger();

    await waitFor(() =>
      expect(screen.getByTestId('employee')).toHaveTextContent('order-desk'),
    );
  });

  it('still opens on the employee it names', async () => {
    render(<Page triggerEmployee='atlas' />);

    await openFromTrigger();

    await waitFor(() =>
      expect(screen.getByTestId('employee')).toHaveTextContent('atlas'),
    );
  });
});

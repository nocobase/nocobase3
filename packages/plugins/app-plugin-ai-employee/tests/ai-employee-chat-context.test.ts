import { describe, expect, it, vi } from 'vitest';
import type { LLMProvider } from '@nocobase/ai-employee';
import { AIEmployeeChatContextProvider } from '../server/agent/ai-employee/providers.js';

const createFixture = (promptMode: 'default' | 'raw' | 'none' = 'default') => {
  const provider = {
    parseResponseMetadata: vi.fn((output) => [output.id, output.metadata]),
  } as unknown as LLMProvider;
  const options = {
    model: { model: 'model-1' },
    employee: {
      username: 'dara',
      nickname: 'Dara',
      about: 'Employee prompt',
      chatSettings: { systemPromptMode: promptMode },
    },
    agentContext: {
      actor: { id: 1, roles: ['member'], locale: 'en-US' },
      ai: {
        llmProviderManager: {
          getLLMService: vi.fn(async () => ({
            provider,
            service: { provider: 'test-provider', name: 'test-service' },
            model: 'model-1',
          })),
        },
      },
    },
    repositories: {
      usersAiEmployees: { findOne: vi.fn(async () => null) },
    },
    knowledgeBaseManager: {
      isEnabledKnowledgeBase: vi.fn(async () => false),
      hasAccessibleKnowledgeBase: vi.fn(async () => false),
    },
    builtInManager: { setupBuiltInInfo: vi.fn() },
    execution: {},
  } as any;
  const context = new AIEmployeeChatContextProvider(options);
  const toolContext = {
    getAvailableSkills: vi
      .spyOn(context, 'getAvailableSkills')
      .mockResolvedValue([]),
    getAvailableAIEmployees: vi
      .spyOn(context, 'getAvailableAIEmployees')
      .mockResolvedValue([]),
    getAgentTools: vi
      .spyOn(context, 'getAgentTools')
      .mockResolvedValue({ tools: [], baseToolNames: new Set() }),
    getActivatedSkillToolNames: vi
      .spyOn(context, 'getActivatedSkillToolNames')
      .mockResolvedValue(new Set()),
  };
  return { provider, context, toolContext };
};

describe('AIEmployeeChatContextProvider', () => {
  it('keeps raw and none prompt modes at the context boundary', async () => {
    const raw = createFixture('raw');
    const none = createFixture('none');
    const rawLLM = await raw.context.resolveLLM({});
    const noneLLM = await none.context.resolveLLM({});

    expect(await raw.context.getSystemPrompt([], {}, rawLLM)).toBe(
      'Employee prompt',
    );
    expect(await none.context.getSystemPrompt([], {}, noneLLM)).toBe('');
  });

  it('isolates, consumes, and disposes response metadata per resolution', async () => {
    const { context } = createFixture();
    const first = await context.resolveLLM({});
    const second = await context.resolveLLM({});
    const firstConfig = await context.getExecutionConfig({}, first);
    const secondConfig = await context.getExecutionConfig({}, second);
    const firstCollector = (firstConfig.callbacks as any[])[0];
    const secondCollector = (secondConfig.callbacks as any[])[0];

    firstCollector.handleLLMEnd({ id: 'first', metadata: { run: 1 } });
    secondCollector.handleLLMEnd({ id: 'second', metadata: { run: 2 } });

    expect(first.takeResponseMetadata?.('first')).toEqual({ run: 1 });
    expect(first.takeResponseMetadata?.('first')).toBeUndefined();
    expect(first.takeResponseMetadata?.('second')).toBeUndefined();
    expect(second.takeResponseMetadata?.('second')).toEqual({ run: 2 });

    firstCollector.handleLLMEnd({ id: 'disposed', metadata: { run: 3 } });
    await first.dispose?.();
    expect(first.takeResponseMetadata?.('disposed')).toBeUndefined();
  });

  it('re-reads activated skill tools on every activeTools query', async () => {
    const { context, toolContext } = createFixture();
    toolContext.getAgentTools.mockResolvedValue({
      tools: [
        { definition: { name: 'getSkill' } },
        { definition: { name: 'skillTool' } },
      ],
      baseToolNames: new Set(['getSkill']),
    });
    toolContext.getActivatedSkillToolNames
      .mockResolvedValueOnce(new Set())
      .mockResolvedValueOnce(new Set(['skillTool']));

    expect(await context.activeTools({})).toEqual(new Set(['getSkill']));
    expect(await context.activeTools({})).toEqual(
      new Set(['getSkill', 'skillTool']),
    );
    expect(toolContext.getActivatedSkillToolNames).toHaveBeenCalledTimes(2);
  });
});

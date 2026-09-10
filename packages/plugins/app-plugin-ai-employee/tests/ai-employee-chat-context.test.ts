import { describe, expect, it, vi } from 'vitest';
import type { LLMProvider } from '@nocobase/ai-employee';
import { AIEmployeeChatContextProvider } from '../server/agent/ai-employee/providers.js';

const createFixture = (promptMode: 'default' | 'raw' | 'none' = 'default') => {
  const provider = {
    parseResponseMetadata: vi.fn((output) => [output.id, output.metadata]),
  } as unknown as LLMProvider;
  const actor = { id: 1, roles: ['member'], locale: 'en-US' };
  const llmProviderManager = {
    getLLMService: vi.fn(async () => ({
      provider,
      service: { provider: 'test-provider', name: 'test-service' },
      model: 'model-1',
    })),
  };
  const toolRuntimeContext = { actor, ai: {} };
  const options = {
    model: { model: 'model-1' },
    employee: {
      username: 'dara',
      nickname: 'Dara',
      about: 'Employee prompt',
      chatSettings: { systemPromptMode: promptMode },
    },
    sessionId: 'session-1',
    actor,
    toolRuntimeContext,
    llmProviderManager,
    toolsManager: {},
    skillsManager: {},
    conversations: {},
    employees: {},
    toolMessages: {},
    usersAiEmployees: { findOne: vi.fn(async () => null) },
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

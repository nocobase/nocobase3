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
    conversations: {
      findOne: vi.fn(async () => null),
      update: vi.fn(async () => undefined),
    },
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
      .mockResolvedValue({ tools: new Map(), baseToolNames: new Set() }),
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
    expect(await raw.context.getSystemPrompt([])).toBe('Employee prompt');
    expect(await none.context.getSystemPrompt([])).toBe('');
  });

  it('re-reads activated skill tools on every activeTools query', async () => {
    const { context, toolContext } = createFixture();
    toolContext.getAgentTools.mockResolvedValue({
      tools: new Map([
        ['getSkill', { definition: { name: 'getSkill' } }],
        ['skillTool', { definition: { name: 'skillTool' } }],
      ]),
      baseToolNames: new Set(['getSkill']),
    });
    toolContext.getActivatedSkillToolNames
      .mockResolvedValueOnce(new Set())
      .mockResolvedValueOnce(new Set(['skillTool']));

    expect(await context.activeTools()).toEqual(new Set());
    expect(await context.activeTools()).toEqual(new Set(['skillTool']));
    expect(toolContext.getAgentTools).not.toHaveBeenCalled();
    expect(toolContext.getActivatedSkillToolNames).toHaveBeenCalledTimes(2);
  });

  it('resolves effective auto policy on cloned discovered tools', async () => {
    const { context, toolContext } = createFixture();
    toolContext.getAgentTools.mockRestore();
    const invoke = vi.fn();
    const tools = [
      {
        scope: 'GENERAL',
        defaultPermission: 'ALLOW',
        definition: { name: 'generalAllow', description: 'allow' },
        invoke,
      },
      {
        scope: 'GENERAL',
        defaultPermission: 'ASK',
        definition: { name: 'generalAsk', description: 'ask' },
        invoke,
      },
      {
        scope: 'CUSTOM',
        defaultPermission: 'ASK',
        definition: { name: 'customEnabled', description: 'enabled' },
        invoke,
      },
      {
        scope: 'CUSTOM',
        defaultPermission: 'ALLOW',
        definition: { name: 'customDisabled', description: 'disabled' },
        invoke,
      },
      {
        scope: 'CUSTOM',
        defaultPermission: 'ALLOW',
        definition: {
          name: 'customFallbackAllow',
          description: 'fallback allow',
        },
        invoke,
      },
      {
        scope: 'CUSTOM',
        defaultPermission: 'ASK',
        definition: { name: 'customFallbackAsk', description: 'fallback ask' },
        invoke,
      },
    ];
    const manager = (context as any).toolsManager;
    manager.listTools = vi.fn(async (filter: { scope?: string }) =>
      filter.scope === 'GENERAL' ? tools.slice(0, 2) : tools,
    );
    manager.getTools = vi.fn(async () => undefined);
    (context as any).skillsManager.listSkills = vi.fn(async () => []);
    (context as any).skillsManager.getSkills = vi.fn(async () => []);
    (context as any).employee.skillSettings = {
      tools: [
        { name: 'customEnabled', autoCall: true },
        { name: 'customDisabled', autoCall: false },
      ],
    };

    const discovered = await context.discoveredTools();

    expect([...discovered].map(([name, tool]) => [name, tool.auto])).toEqual([
      ['generalAllow', true],
      ['generalAsk', false],
      ['customEnabled', true],
      ['customDisabled', false],
      ['customFallbackAllow', true],
      ['customFallbackAsk', false],
    ]);
    for (const original of tools) {
      expect(original).not.toHaveProperty('auto');
      expect(discovered.get(original.definition.name)).not.toBe(original);
      expect(discovered.get(original.definition.name)?.definition).not.toBe(
        original.definition,
      );
    }
  });
});

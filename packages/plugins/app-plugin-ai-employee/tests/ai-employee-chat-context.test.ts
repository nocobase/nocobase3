import { describe, expect, it, vi } from 'vitest';
import type { LLMProvider } from '@nocobase/ai-employee';
import { AIEmployeeAgentContextProvider } from '../server/agent/context/ai-employee/context.js';

const createFixture = (
  promptMode: 'default' | 'raw' | 'none' = 'default',
  state: Record<string, unknown> = {},
) => {
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
  const agentContext = {
    actor,
    ai: {},
    state: { sessionId: 'session-1', ...state },
    runtime: { logger: { warn: vi.fn(), error: vi.fn() } },
  };
  const employeeModel = {
    llmService: 'employee-service',
    model: 'employee-model',
  };
  // The provider asks the manager that owns the employee's model policy.
  const resolveModel = vi.fn(
    async (_employee: unknown, model?: unknown) => model ?? employeeModel,
  );
  const aiEmployeesManager = { resolveModel };
  const options = {
    employee: {
      username: 'dara',
      nickname: 'Dara',
      about: 'Employee prompt',
      chatSettings: { systemPromptMode: promptMode },
    },
    agentContext,
    aiEmployeesManager,
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
  } as any;
  const context = new AIEmployeeAgentContextProvider(options);
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
  return {
    provider,
    context,
    toolContext,
    llmProviderManager,
    resolveModel,
    employeeModel,
  };
};

describe('AIEmployeeAgentContextProvider', () => {
  it('keeps raw and none prompt modes at the context boundary', async () => {
    const raw = createFixture('raw');
    const none = createFixture('none');
    expect(await raw.context.getSystemPrompt([])).toBe('Employee prompt');
    expect(await none.context.getSystemPrompt([])).toBe('');
  });

  it('resolves the model the turn asked for through the employee policy', async () => {
    const asked = { llmService: 'service-1', model: 'model-1' };
    const { context, llmProviderManager, resolveModel } = createFixture(
      'default',
      { model: asked },
    );

    // The model is the agent's, not a request's: every call resolves the one
    // the turn asked for, through the employee's policy.
    await context.resolveLLM();
    await context.resolveLLM();

    expect(resolveModel).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ username: 'dara' }),
      asked,
    );
    expect(resolveModel).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ username: 'dara' }),
      asked,
    );
    expect(llmProviderManager.getLLMService).toHaveBeenNthCalledWith(1, asked);
    expect(llmProviderManager.getLLMService).toHaveBeenNthCalledWith(2, asked);
  });

  it('falls back to the employee model when the turn selected none', async () => {
    const { context, llmProviderManager, employeeModel } = createFixture();

    await expect(context.resolveLLM()).resolves.toMatchObject({
      llmService: 'test-service',
    });
    expect(llmProviderManager.getLLMService).toHaveBeenCalledWith(
      employeeModel,
    );
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
      .mockResolvedValueOnce(new Set(['skillTool', 'notRegistered']));
    const discovered = await context.discoveredTools();
    expect(await discovered.activeTools()).toEqual(new Set(['getSkill']));
    expect(await discovered.activeTools()).toEqual(
      new Set(['getSkill', 'skillTool']),
    );
    expect(toolContext.getAgentTools).toHaveBeenCalledOnce();
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

    expect(
      [...discovered.tools].map(([name, tool]) => [name, tool.auto]),
    ).toEqual([
      ['generalAllow', true],
      ['generalAsk', false],
      ['customEnabled', true],
      ['customDisabled', false],
      ['customFallbackAllow', true],
      ['customFallbackAsk', false],
    ]);
    for (const original of tools) {
      expect(original).not.toHaveProperty('auto');
      expect(discovered.tools.get(original.definition.name)).not.toBe(original);
      expect(
        discovered.tools.get(original.definition.name)?.definition,
      ).not.toBe(original.definition);
    }
  });
});

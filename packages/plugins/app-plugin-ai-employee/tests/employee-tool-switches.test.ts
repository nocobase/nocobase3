import { describe, expect, it, vi } from 'vitest';
import { SYSTEM_TOOLS, type ToolsEntity } from '@nocobase/ai-employee';
import {
  AIEmployeeAgentContextProvider,
  type AIEmployeeAgentContextProviderOptions,
} from '../server/agent/context/ai-employee/context.js';

function createFixture(
  enabledTools?: string[] | null,
  sessionTools?: string[],
  overrides: Partial<AIEmployeeAgentContextProviderOptions> = {},
) {
  const tool = (name: string, scope: string, defaultPermission = 'ASK') => ({
    scope,
    defaultPermission,
    definition: { name, description: name },
    invoke: vi.fn(),
  });
  const tools = [
    tool('general', 'GENERAL'),
    tool('specified', 'SPECIFIED'),
    tool('unconfigured-specified', 'SPECIFIED'),
    tool('unconfigured-custom', 'CUSTOM'),
    tool('custom', 'CUSTOM', 'ALLOW'),
    tool('custom-allow', 'CUSTOM'),
    tool('extra', 'SPECIFIED'),
    tool('loadFrontendTool', 'GENERAL'),
    tool('executeFrontendTool', 'GENERAL'),
    tool(SYSTEM_TOOLS.GET_SKILL, 'SPECIFIED', 'ALLOW'),
    tool(SYSTEM_TOOLS.WEB_SEARCH, 'SPECIFIED'),
    tool(SYSTEM_TOOLS.KNOWLEDGE_BASE, 'SPECIFIED'),
  ];
  const employee = {
    username: 'test',
    skillSettings: {
      skills: [],
      tools: [
        { name: 'general', autoCall: true },
        { name: 'specified', autoCall: true },
        { name: 'custom', autoCall: false },
        { name: 'custom-allow', autoCall: true },
      ],
      ...(enabledTools === undefined ? {} : { enabledTools }),
    },
  };
  const options = {
    employee,
    sessionId: 'test',
    actor: { id: 1, roles: [], isRoot: false },
    currentConversation: { sessionId: 'test' },
    toolRuntimeContext: {},
    toolsManager: {
      listTools: vi.fn(async (filter: { scope?: string }) =>
        tools.filter((entry) => !filter.scope || entry.scope === filter.scope),
      ),
      getTools: vi.fn(async (name: string) =>
        tools.find((entry) => entry.definition.name === name),
      ),
    },
    skillsManager: {
      listSkills: vi.fn(async () => []),
      getSkills: vi.fn(async () => []),
    },
    builtInManager: { setupBuiltInInfo() {} },
    knowledgeBaseManager: {
      isEnabledKnowledgeBase: async () => true,
      hasAccessibleKnowledgeBase: async () => true,
    },
    conversations: { findOne: async () => null },
    toolMessages: { find: async () => [] },
    webSearch: true,
    tools: [{ name: 'extra' }],
    ...(sessionTools
      ? { skillSettings: { tools: sessionTools, toolsVersion: 1 } }
      : {}),
    ...overrides,
  } as unknown as AIEmployeeAgentContextProviderOptions;
  return {
    provider: new AIEmployeeAgentContextProvider(options),
    employee,
    tools,
  };
}

async function active(provider: AIEmployeeAgentContextProvider) {
  const discovery = await provider.discoveredTools();
  return { discovery, names: [...(await discovery.activeTools())] };
}

describe('employee tool switch runtime', () => {
  it.each([undefined, null])(
    'keeps legacy injections and permissions for %j',
    async (selection) => {
      const { provider } = createFixture(selection);
      const { names } = await active(provider);
      expect(names).toEqual(
        expect.arrayContaining([
          'general',
          'specified',
          'custom',
          'extra',
          SYSTEM_TOOLS.GET_SKILL,
          SYSTEM_TOOLS.WEB_SEARCH,
          SYSTEM_TOOLS.KNOWLEDGE_BASE,
        ]),
      );
      expect(names).not.toContain('loadFrontendTool');
    },
  );

  it.each([
    { webSearch: false, enabled: true, accessible: false, expected: [] },
    {
      webSearch: true,
      enabled: true,
      accessible: false,
      expected: [SYSTEM_TOOLS.WEB_SEARCH],
    },
    {
      webSearch: false,
      enabled: true,
      accessible: true,
      expected: [SYSTEM_TOOLS.KNOWLEDGE_BASE],
    },
    {
      webSearch: true,
      enabled: false,
      accessible: true,
      expected: [SYSTEM_TOOLS.WEB_SEARCH],
    },
    {
      webSearch: true,
      enabled: true,
      accessible: true,
      expected: [SYSTEM_TOOLS.WEB_SEARCH, SYSTEM_TOOLS.KNOWLEDGE_BASE],
    },
  ])(
    'requires optional capabilities after selection and skill activation: %j',
    async ({ webSearch, enabled, accessible, expected }) => {
      const optional = [SYSTEM_TOOLS.WEB_SEARCH, SYSTEM_TOOLS.KNOWLEDGE_BASE];
      for (const activated of [false, true]) {
        const skill = {
          name: 'optional-tools',
          scope: 'GENERAL',
          tools: optional,
        };
        const hasAccessibleKnowledgeBase = vi.fn(async () => accessible);
        const { provider } = createFixture(
          [SYSTEM_TOOLS.GET_SKILL, ...optional],
          undefined,
          {
            webSearch,
            knowledgeBaseManager: {
              isEnabledKnowledgeBase: async () => enabled,
              hasAccessibleKnowledgeBase,
            } as unknown as AIEmployeeAgentContextProviderOptions['knowledgeBaseManager'],
            ...(activated
              ? {
                  skillsManager: {
                    listSkills: async () => [skill],
                    getSkills: async () => [skill],
                  } as unknown as AIEmployeeAgentContextProviderOptions['skillsManager'],
                  toolMessages: {
                    find: async () => [{ content: { skillName: skill.name } }],
                  } as unknown as AIEmployeeAgentContextProviderOptions['toolMessages'],
                }
              : {}),
          },
        );
        const { discovery, names } = await active(provider);
        const expectedNames = new Set([SYSTEM_TOOLS.GET_SKILL, ...expected]);
        expect(new Set(names)).toEqual(expectedNames);
        expect(new Set(discovery.tools.keys())).toEqual(expectedNames);
        if (activated) {
          expect(await provider.getActivatedSkillToolNames()).toEqual(
            new Set(expected),
          );
        }
        if (enabled) {
          expect(hasAccessibleKnowledgeBase).toHaveBeenCalledWith({
            employee: expect.objectContaining({ username: 'test' }),
            roleNames: [],
          });
        }
      }
    },
  );

  it.each(['employee', 'request', 'general'])(
    'checks KB access for %s injections while retaining deliberately configured legacy web search',
    async (source) => {
      const optional = [SYSTEM_TOOLS.WEB_SEARCH, SYSTEM_TOOLS.KNOWLEDGE_BASE];
      const { provider, employee, tools } = createFixture(
        undefined,
        undefined,
        {
          webSearch: false,
          knowledgeBaseManager: {
            isEnabledKnowledgeBase: async () => true,
            hasAccessibleKnowledgeBase: async () => false,
          } as unknown as AIEmployeeAgentContextProviderOptions['knowledgeBaseManager'],
          ...(source === 'request'
            ? { tools: optional.map((name) => ({ name })) }
            : {}),
        },
      );
      if (source === 'employee') {
        employee.skillSettings.tools.push(
          ...optional.map((name) => ({ name, autoCall: false })),
        );
      }
      if (source === 'general') {
        for (const tool of tools) {
          if (optional.includes(tool.definition.name)) tool.scope = 'GENERAL';
        }
      }
      const { discovery, names } = await active(provider);
      expect(discovery.tools.has(SYSTEM_TOOLS.KNOWLEDGE_BASE)).toBe(false);
      expect(names).not.toContain(SYSTEM_TOOLS.KNOWLEDGE_BASE);
      expect(discovery.tools.has(SYSTEM_TOOLS.WEB_SEARCH)).toBe(
        source !== 'general',
      );
      expect(names.includes(SYSTEM_TOOLS.WEB_SEARCH)).toBe(
        source !== 'general',
      );
    },
  );

  it('filters general, custom, system, web search, knowledge base and extra injections in the full discovered map', async () => {
    for (const selected of [[], ['specified']]) {
      const { provider } = createFixture(selected);
      const { discovery, names } = await active(provider);
      expect(names).toEqual(selected);
      expect([...discovery.tools.keys()]).toEqual(selected);
    }
  });

  it('selects unconfigured SPECIFIED and CUSTOM candidates without broadening frontend restrictions or changing permissions', async () => {
    const selected = [
      'general',
      'specified',
      'custom',
      'custom-allow',
      'unconfigured-specified',
      'unconfigured-custom',
      'loadFrontendTool',
      'executeFrontendTool',
      'unknown',
    ];
    const { provider, tools } = createFixture(selected);
    const { discovery, names } = await active(provider);
    expect(new Set(names)).toEqual(
      new Set([
        'general',
        'specified',
        'custom',
        'custom-allow',
        'unconfigured-specified',
        'unconfigured-custom',
      ]),
    );
    expect(new Set(discovery.tools.keys())).toEqual(new Set(names));
    expect(discovery.tools.get('general')?.auto).toBe(false);
    expect(discovery.tools.get('specified')?.auto).toBe(false);
    expect(discovery.tools.get('custom')?.auto).toBe(false);
    expect(discovery.tools.get('custom-allow')?.auto).toBe(true);
    expect(discovery.tools.get('unconfigured-specified')?.auto).toBe(false);
    expect(discovery.tools.get('unconfigured-custom')?.auto).toBe(false);
    for (const original of tools) expect(original).not.toHaveProperty('auto');
  });

  it('allows session selection only to narrow, including when it names disabled system tools', async () => {
    const { provider } = createFixture(
      ['general', 'custom'],
      ['custom', 'extra', SYSTEM_TOOLS.GET_SKILL, SYSTEM_TOOLS.WEB_SEARCH],
    );
    const { discovery, names } = await active(provider);
    expect(names).toEqual(['custom']);
    expect([...discovery.tools.keys()]).toEqual(['custom']);
  });

  it('retains ASK and ALLOW when disabling and re-enabling tools', async () => {
    const { provider, employee } = createFixture(['custom', 'custom-allow']);
    const before = (await active(provider)).discovery.tools;
    employee.skillSettings.enabledTools = [];
    expect((await active(provider)).discovery.tools.size).toBe(0);
    employee.skillSettings.enabledTools = ['custom', 'custom-allow'];
    const after = (await active(provider)).discovery.tools;
    for (const name of ['custom', 'custom-allow']) {
      expect((after.get(name) as ToolsEntity).auto).toBe(
        before.get(name)?.auto,
      );
    }
    expect(after.get('custom')?.auto).toBe(false);
  });
});

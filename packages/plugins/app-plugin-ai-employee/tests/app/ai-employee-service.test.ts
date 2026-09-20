import {
  DefaultAIEmployeeManager,
  EEFeatures,
  MemoryAIEmployeeRepository,
  type AIEmployeeEntity,
} from '@nocobase/ai-employee';
import { describe, expect, it, vi } from 'vitest';

import { AIEmployeeService } from '../../server/service/ai-employee-service.js';

function createFixture(initial: AIEmployeeEntity[] = []) {
  const rows = new Map(
    initial.map((row) => [row.username, structuredClone(row)]),
  );
  const repository = {
    find: vi.fn(async () =>
      [...rows.values()].map((row) => structuredClone(row)),
    ),
    findOne: vi.fn(async ({ filter }: { filter: { username: string } }) => {
      const row = rows.get(filter.username);
      return row ? structuredClone(row) : null;
    }),
    create: vi.fn(async ({ values }: { values: AIEmployeeEntity }) => {
      rows.set(values.username, structuredClone(values));
      return structuredClone(values);
    }),
    update: vi.fn(
      async ({
        filter,
        values,
      }: {
        filter: { username: string };
        values: AIEmployeeEntity;
      }) => {
        rows.set(filter.username, structuredClone(values));
      },
    ),
    destroy: vi.fn(async ({ filter }: { filter: { username: string } }) => {
      rows.delete(filter.username);
    }),
  };
  const ai = {
    skillsManager: {
      listSkills: vi.fn(async () => [
        { name: 'general' },
        { name: 'registered' },
      ]),
    },
    toolsManager: { listTools: vi.fn(async () => []) },
    features: {
      isFeaturesEnabled: vi.fn((features: string[]) =>
        features.includes(EEFeatures.knowledgeBase),
      ),
      knowledgeBase: {
        getKnowledgeBase: vi.fn(async (keys: string[]) =>
          keys.includes('existing')
            ? [{ key: 'existing', name: 'Existing', enabled: true }]
            : [],
        ),
      },
    },
  };
  const database = {
    transaction: async (run: (connection: unknown) => Promise<void>) => run({}),
  };
  const repositories = {
    aiEmployees: repository,
    usersAiEmployees: { find: vi.fn(async () => []) },
  };
  const translate = (key: string) => `localized:${key}`;
  const service = new AIEmployeeService({
    ai: ai as never,
    repositories: repositories as never,
    database: database as never,
  });
  return { service, translate, ai, repository, database };
}

describe('AI employee management service', () => {
  it.each([undefined, null])(
    'retains a permission-only Ask save after restart with inherited selection %j',
    async (enabledTools) => {
      const repository = new MemoryAIEmployeeRepository();
      const manager = new DefaultAIEmployeeManager(repository);
      const registered = {
        username: 'tools',
        tools: [{ name: 'custom', autoCall: true }],
      };
      await manager.registerEmployee(registered);
      const { ai, translate, database } = createFixture();
      ai.toolsManager.listTools.mockResolvedValue([
        {
          definition: { name: 'custom' },
          scope: 'CUSTOM',
          defaultPermission: 'ALLOW',
        },
      ] as never);
      const service = new AIEmployeeService({
        ai: ai as never,
        repositories: {
          aiEmployees: repository,
          usersAiEmployees: { find: async () => [] },
        } as never,
        database: database as never,
      });
      await service.upsert({
        input: {
          username: 'tools',
          skillSettings: {
            tools: [{ name: 'custom', autoCall: false }],
            ...(enabledTools === undefined ? {} : { enabledTools }),
          },
        },
        translate,
      });
      const restarted = new DefaultAIEmployeeManager(
        new MemoryAIEmployeeRepository(),
      );
      await restarted.registerEmployee(registered);
      await restarted.switchRepository(repository);
      await restarted.registerEmployee(registered);
      const saved = await service.get({ username: 'tools', translate });
      expect(saved.skillSettings?.enabledTools).toBe(enabledTools);
      expect(saved.skillSettings?.tools).toEqual([
        { name: 'custom', autoCall: false },
      ]);
      const employees = await service.listByUser({
        actor: { id: 1, roles: [], isRoot: false },
        translate,
      });
      expect(employees[0].skillSettings?.tools).toEqual([
        { name: 'custom', autoCall: false },
      ]);
    },
  );

  it('preserves tool permissions and unknown selections while toggling tools and resetting legacy defaults', async () => {
    const { service, translate } = createFixture();
    const save = (skillSettings: unknown) =>
      service.upsert({
        input: { username: 'tools', skillSettings },
        translate,
      });
    const tools = [{ name: 'custom-ask', autoCall: false }];
    await save({ skills: [], tools, enabledTools: ['unknown', 'unknown'] });
    await expect(save({ skills: ['updated'] })).resolves.toMatchObject({
      skillSettings: { tools, enabledTools: ['unknown'] },
    });
    for (const enabledTools of [[], ['custom-ask'], null]) {
      await expect(save({ enabledTools })).resolves.toMatchObject({
        skillSettings: { tools, enabledTools },
      });
    }
  });

  it.each(
    ['bad', 3, false, {}, ['ok', 1], [''], ['   ']].map((enabledTools) => ({
      enabledTools,
    })),
  )(
    'rejects invalid enabledTools $enabledTools before writing',
    async ({ enabledTools }) => {
      const { service, translate, repository } = createFixture();
      await expect(
        service.upsert({
          input: { username: 'invalid', skillSettings: { enabledTools } },
          translate,
        }),
      ).rejects.toThrow('skillSettings.enabledTools');
      expect(repository.create).not.toHaveBeenCalled();
      expect(repository.update).not.toHaveBeenCalled();
    },
  );

  it.each([
    { enabledTools: undefined, expected: ['custom', 'general'] },
    { enabledTools: null, expected: ['custom', 'general'] },
    { enabledTools: [], expected: [] },
    {
      enabledTools: ['custom', 'specified', 'general', 'unknown', 'custom'],
      expected: ['custom', 'specified', 'general', 'unknown'],
    },
  ])(
    'returns the effective tool union without changing saved permissions: $enabledTools',
    async ({ enabledTools, expected }) => {
      const storedTools = [
        { name: 'custom', autoCall: false },
        { name: 'general', autoCall: true },
      ];
      const { service, translate, ai } = createFixture([
        {
          username: 'tools',
          enabled: true,
          skillSettings: { skills: [], tools: storedTools, enabledTools },
        },
      ]);
      ai.toolsManager.listTools.mockResolvedValue([
        {
          definition: { name: 'general' },
          scope: 'GENERAL',
          defaultPermission: 'ASK',
        },
        {
          definition: { name: 'specified' },
          scope: 'SPECIFIED',
          defaultPermission: 'ASK',
        },
        {
          definition: { name: 'custom' },
          scope: 'CUSTOM',
          defaultPermission: 'ALLOW',
        },
      ] as never);
      const result = await service.listByUser({
        actor: { id: 1, roles: [], isRoot: false },
        translate,
      });
      expect(result[0].skillSettings?.tools?.map((tool) => tool.name)).toEqual(
        expected,
      );
      for (const tool of result[0].skillSettings?.tools ?? []) {
        if (tool.name !== 'unknown') expect(tool.autoCall).toBe(false);
      }
      await expect(
        service.get({ username: 'tools', translate }),
      ).resolves.toMatchObject({
        skillSettings: {
          tools: storedTools,
          enabledTools:
            enabledTools == null ? enabledTools : [...new Set(enabledTools)],
        },
      });
    },
  );

  it('normalizes explicit skill selections, preserves omissions and supports null reset', async () => {
    const { service, translate } = createFixture();
    const save = (input: Record<string, unknown>) =>
      service.upsert({ input: { username: 'support', ...input }, translate });
    await save({
      skillSettings: {
        skills: ['legacy'],
        tools: [{ name: 'legacy-tool' }],
        enabledSkills: ['specified', 'specified'],
      },
    });
    await expect(
      service.get({ username: 'support', translate }),
    ).resolves.toMatchObject({
      skillSettings: {
        skills: ['legacy'],
        tools: [{ name: 'legacy-tool' }],
        enabledSkills: ['specified'],
      },
    });
    await save({ nickname: 'Renamed' });
    await save({ skillSettings: { skills: ['updated'], tools: [] } });
    await expect(
      service.get({ username: 'support', translate }),
    ).resolves.toMatchObject({
      skillSettings: {
        skills: ['updated'],
        tools: [],
        enabledSkills: ['specified'],
      },
    });
    for (const enabledSkills of [[], null]) {
      await expect(
        save({ skillSettings: { enabledSkills } }),
      ).resolves.toMatchObject({ skillSettings: { enabledSkills } });
    }
  });

  it.each(
    ['bad', 3, false, {}, ['ok', 1], [''], ['   ']].map((enabledSkills) => ({
      enabledSkills,
    })),
  )(
    'rejects invalid enabledSkills $enabledSkills without saving',
    async ({ enabledSkills }) => {
      const { service, translate } = createFixture();
      await expect(
        service.upsert({
          input: { username: 'invalid', skillSettings: { enabledSkills } },
          translate,
        }),
      ).rejects.toThrow('skillSettings.enabledSkills');
      await expect(service.list({ translate })).resolves.toEqual([]);
    },
  );

  it.each([
    { enabledSkills: undefined, expected: ['registered', 'general'] },
    { enabledSkills: null, expected: ['registered', 'general'] },
    { enabledSkills: [], expected: [] },
    { enabledSkills: ['specified', 'specified'], expected: ['specified'] },
  ])(
    'returns effective deduplicated skill names for $enabledSkills',
    async ({ enabledSkills, expected }) => {
      const { service, translate } = createFixture([
        {
          username: 'support',
          enabled: true,
          skillSettings: {
            skills: ['registered', 'registered'],
            tools: [],
            enabledSkills,
          },
        },
      ]);
      const result = await service.listByUser({
        actor: { id: 1, roles: [], isRoot: false },
        translate,
      });
      expect(result[0].skillSettings?.skills).toEqual(expected);
      await expect(
        service.get({ username: 'support', translate }),
      ).resolves.toMatchObject({
        skillSettings: { skills: ['registered', 'registered'] },
      });
    },
  );

  it('preserves omitted fields and persists explicit false and empty values', async () => {
    const { service, translate } = createFixture();

    await service.upsert({
      input: {
        username: 'support',
        nickname: 'Support',
        about: 'Original about',
        enableKnowledgeBase: true,
        knowledgeBasePrompt: 'Original prompt',
        knowledgeBase: {
          knowledgeBaseKeys: ['handbook'],
          topK: 5,
          score: 0.7,
        },
      },
      translate,
    });
    await service.upsert({
      input: { username: 'support', profile: { nickname: 'Specialist' } },
      translate,
    });

    await expect(
      service.get({ username: 'support', translate }),
    ).resolves.toMatchObject({
      nickname: 'Specialist',
      about: 'Original about',
      enableKnowledgeBase: true,
      knowledgeBasePrompt: 'Original prompt',
      knowledgeBase: { knowledgeBaseKeys: ['handbook'], topK: 5, score: 0.7 },
    });

    await service.upsert({
      input: {
        username: 'support',
        about: '',
        enableKnowledgeBase: false,
        knowledgeBasePrompt: '',
        knowledgeBase: { knowledgeBaseKeys: [], topK: 3, score: 0 },
      },
      translate,
    });

    await expect(
      service.get({ username: 'support', translate }),
    ).resolves.toMatchObject({
      about: '',
      enableKnowledgeBase: false,
      knowledgeBasePrompt: '',
      knowledgeBase: { knowledgeBaseKeys: [], topK: 3, score: 0 },
    });
  });

  it('serializes localized built-ins and missing knowledge base keys', async () => {
    const { service, translate } = createFixture([
      {
        username: 'built-in',
        nickname: 'Built-in nickname',
        position: 'Position',
        bio: 'Bio',
        greeting: 'Greeting',
        builtIn: true,
        enabled: true,
        enableKnowledgeBase: true,
        knowledgeBasePrompt: 'Prompt',
        knowledgeBase: {
          knowledgeBaseKeys: ['existing', 'missing'],
          topK: 3,
          score: 0.6,
        },
      } as AIEmployeeEntity,
    ]);

    await expect(service.list({ translate })).resolves.toEqual([
      expect.objectContaining({
        nickname: 'localized:Built-in nickname',
        position: 'localized:Position',
        bio: 'localized:Bio',
        greeting: 'localized:Greeting',
        enableKnowledgeBase: true,
        knowledgeBasePrompt: 'Prompt',
        missingKnowledgeBaseKeys: ['missing'],
      }),
    ]);
  });
});

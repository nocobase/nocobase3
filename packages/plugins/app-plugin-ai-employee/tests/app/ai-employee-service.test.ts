import { EEFeatures, type AIEmployeeEntity } from '@nocobase/ai-employee';
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
  return { service, translate };
}

describe('AI employee management service', () => {
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

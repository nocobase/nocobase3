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
  const repositories = { aiEmployees: repository };
  const translate = (key: string) => `localized:${key}`;
  const service = new AIEmployeeService({
    ai: ai as never,
    repositories: repositories as never,
    database: database as never,
  });
  return { service, translate };
}

describe('AI employee management service', () => {
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

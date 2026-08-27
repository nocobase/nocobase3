import { describe, expect, it, vi } from 'vitest';
import { EEFeatures } from '@nocobase/ai-employee';
import type { AIEmployeeEntity, RuntimeActor } from '@nocobase/ai-employee';

import { AIEmployeeAccessPolicy } from '../../server/auth/access-policy.js';
import type { Context } from '../../server/context.js';
import { AIEmployeeService } from '../../server/service/ai-employee-service.js';

const rootActor: RuntimeActor = { id: 'root', roles: ['root'] };

function createContext(initial: AIEmployeeEntity[] = []): Context {
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
  const knowledgeBase = {
    getKnowledgeBase: vi.fn(async (keys: string[]) =>
      keys.includes('existing')
        ? [{ key: 'existing', name: 'Existing', enabled: true }]
        : [],
    ),
  };
  return {
    repositories: {
      aiEmployees: repository,
    },
    database: {
      transaction: async (run: (connection: unknown) => Promise<void>) =>
        run({}),
    },
    ai: {
      features: {
        isFeaturesEnabled: vi.fn((features: string[]) =>
          features.includes(EEFeatures.knowledgeBase),
        ),
        knowledgeBase,
      },
    },
    i18nNamespace: '@nocobase/app-plugin-ai-employee',
    t: (key: string) => `localized:${key}`,
  } as unknown as Context;
}

describe('AI employee management service compatibility', () => {
  it('preserves omitted fields and persists explicit false and empty values', async () => {
    const context = createContext();
    const service = new AIEmployeeService(new AIEmployeeAccessPolicy());

    await service.upsert(context, rootActor, {
      username: 'support',
      nickname: 'Support',
      about: 'Original about',
      enableKnowledgeBase: true,
      knowledgeBasePrompt: 'Original prompt',
      knowledgeBase: { knowledgeBaseKeys: ['handbook'], topK: 5, score: 0.7 },
    });
    await service.upsert(context, rootActor, {
      username: 'support',
      profile: { nickname: 'Specialist' },
    });

    await expect(
      service.get(context, rootActor, 'support'),
    ).resolves.toMatchObject({
      nickname: 'Specialist',
      about: 'Original about',
      enableKnowledgeBase: true,
      knowledgeBasePrompt: 'Original prompt',
      knowledgeBase: { knowledgeBaseKeys: ['handbook'], topK: 5, score: 0.7 },
    });

    await service.upsert(context, rootActor, {
      username: 'support',
      about: '',
      enableKnowledgeBase: false,
      knowledgeBasePrompt: '',
      knowledgeBase: { knowledgeBaseKeys: [], topK: 3, score: 0 },
    });

    await expect(
      service.get(context, rootActor, 'support'),
    ).resolves.toMatchObject({
      about: '',
      enableKnowledgeBase: false,
      knowledgeBasePrompt: '',
      knowledgeBase: { knowledgeBaseKeys: [], topK: 3, score: 0 },
    });
  });

  it('serializes localized built-ins and missing knowledge base keys', async () => {
    const context = createContext([
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
    const service = new AIEmployeeService(new AIEmployeeAccessPolicy());

    await expect(service.list(context, rootActor)).resolves.toEqual([
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

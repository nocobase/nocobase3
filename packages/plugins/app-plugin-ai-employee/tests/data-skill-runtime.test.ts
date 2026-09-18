import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import sqlite from '@nocobase/db-sqlite';
import { createDatabaseManager } from '@nocobase/db';
import { createAppAuthorization } from '@nocobase/app-plugin-authorization/server';
import { createDataServices } from '../server/service/data-services.js';
import type { DataServices } from '../server/service/data-contracts.js';
import { buildTool } from '@nocobase/ai-employee';
import { ToolMessage } from 'langchain';
import { describe, expect, it, vi } from 'vitest';

import { AIEmployeeResources } from '../server/ai/index.js';
import { AIEmployeeAgentContextProvider } from '../server/agent/context/ai-employee/context.js';
import type { AIEmployeeAgentContextProviderOptions } from '../server/agent/context/ai-employee/context.js';
import type { AIEmployeeSkillSettings } from '../server/agent/context/ai-employee/options.js';
import { ConversationMessageStoreImpl } from '../server/agent/conversation/message-store.js';
import { skillToolBindingMiddleware } from '../server/agent/middleware/skill-tools.js';
import { toolCallStatusMiddleware } from '../server/agent/middleware/tools.js';
import type { AppAgentContext } from '../server/agent/context.js';
import { createTestAgentContext } from './app/test-context.js';
import { MemoryConversationPersistence } from './memory-conversation-persistence.js';
import { createMockServer } from './mock-server.js';

const skillTools = {
  'data-metadata': [
    'getDataSources',
    'getCollectionNames',
    'getCollectionMetadata',
    'searchFieldMetadata',
  ],
  'data-query': ['dataSourceQuery', 'dataSourceCounting', 'dataQuery'],
  'business-analysis-report': ['businessReportGenerator', 'getSkill'],
};
const gatedTools = Object.values(skillTools)
  .flat()
  .filter((name) => name !== 'getSkill');

interface ToolRequest {
  toolCall: { id: string; name: string; args: Record<string, unknown> };
  state: { messageId: string };
  runtime: { writer: ReturnType<typeof vi.fn> };
}
type ToolHook = (
  request: ToolRequest,
  handler: (request: ToolRequest) => Promise<ToolMessage>,
) => Promise<ToolMessage>;
type ModelHook = (
  request: { tools: { name: string }[] },
  handler: (request: { tools: { name: string }[] }) => Promise<string[]>,
) => Promise<string[]>;

function hook<T>(middleware: unknown, name: string): T {
  const value = (middleware as Record<string, unknown>)[name];
  return (
    typeof value === 'function' ? value : (value as { hook: unknown }).hook
  ) as T;
}

async function createFixture(services?: DataServices) {
  const { aiManager } = await createMockServer();
  await new AIEmployeeResources().registerAIResources(aiManager);
  const persistence = new MemoryConversationPersistence('analysis');
  const metadata = {
    name: 'orders',
    dataSource: 'main',
    fields: {
      items: [{ name: 'amount', type: 'double' }],
      limit: 100,
      offset: 0,
      hasMore: false,
    },
  };
  const data = {
    getDataSources: vi.fn(async () => ({
      items: [{ name: 'main' }],
      limit: 100,
      offset: 0,
      hasMore: false,
    })),
    getCollectionNames: vi.fn(async () => ({
      items: [{ name: 'orders' }],
      limit: 100,
      offset: 0,
      hasMore: false,
    })),
    getCollectionMetadata: vi.fn(async () => metadata),
    searchFieldMetadata: vi.fn(async () => ({
      items: [
        {
          name: 'amount',
          type: 'double',
          collection: 'orders',
          match: 'exact',
        },
      ],
      limit: 100,
      offset: 0,
      hasMore: false,
    })),
    dataSourceQuery: vi.fn(async () => ({
      items: [{ amount: 42 }],
      limit: 100,
      offset: 0,
      hasMore: false,
      truncated: false,
      timezone: 'UTC',
    })),
    dataSourceCounting: vi.fn(async () => ({ count: 1 })),
    dataQuery: vi.fn(async () => ({
      items: [{ total: 42 }],
      truncated: false,
      timezone: 'UTC',
    })),
  };
  const originalContext = createTestAgentContext();
  const runtimeContext: AppAgentContext = {
    ...originalContext,
    ai: aiManager,
    services: { ...originalContext.services, data: services ?? data },
  };

  async function runtime(
    settings?: AIEmployeeSkillSettings,
    sessionId = 'analysis',
  ) {
    const context: AppAgentContext = {
      ...runtimeContext,
      state: { sessionId },
    };
    const currentConversation = { sessionId, username: 'atlas' };
    const provider = new AIEmployeeAgentContextProvider({
      employee: { username: 'atlas', chatSettings: {}, skillSettings: {} },
      sessionId,
      currentConversation,
      actor: context.actor,
      toolRuntimeContext: context,
      llmProviderManager: aiManager.llmProviderManager,
      toolsManager: aiManager.toolsManager,
      skillsManager: aiManager.skillsManager,
      builtInManager: { setupBuiltInInfo() {} },
      knowledgeBaseManager: { isEnabledKnowledgeBase: async () => false },
      conversations: persistence.conversations,
      toolMessages: persistence.toolMessages,
      employees: {},
      usersAiEmployees: {},
      skillSettings: settings,
    } as unknown as AIEmployeeAgentContextProviderOptions);
    const discovered = await provider.discoveredTools();
    const messages = new ConversationMessageStoreImpl({
      sessionId,
      persistence,
      conversation: persistence.createChatConversation({ sessionId }),
      getCurrentFrontendTools: async () => [],
    });
    const binding = skillToolBindingMiddleware(discovered);
    const bindTool = hook<ToolHook>(binding, 'wrapToolCall');
    const bindModel = hook<ModelHook>(binding, 'wrapModelCall');
    const status = hook<ToolHook>(
      toolCallStatusMiddleware(
        { messages },
        currentConversation,
        context.logger,
      ),
      'wrapToolCall',
    );
    const executed = vi.fn(
      async (request: ToolRequest): Promise<ToolMessage> => {
        const entry = discovered.tools.get(request.toolCall.name);
        if (!entry)
          throw new Error(`Unregistered tool: ${request.toolCall.name}`);
        const built = buildTool(entry) as unknown as {
          invoke(input: unknown, config: unknown): Promise<ToolMessage>;
        };
        return built.invoke(request.toolCall.args, {
          context: { agentContext: context },
          toolCall: request.toolCall,
          writer: request.runtime.writer,
        });
      },
    );
    let sequence = 0;
    return {
      discovered,
      executed,
      availableSkills: () => provider.getAvailableSkills(),
      visibleTools: () =>
        bindModel(
          { tools: [...discovered.tools.keys()].map((name) => ({ name })) },
          async (request) => request.tools.map((tool) => tool.name),
        ),
      async call(name: string, args: Record<string, unknown> = {}) {
        const toolCall = {
          id: `call-${sessionId}-${++sequence}`,
          name,
          args,
          type: 'tool_call' as const,
        };
        const saved = await messages.saveAssistantMessage(
          {
            role: 'assistant',
            content: { type: 'text', content: '' },
            toolCalls: [toolCall],
          },
          discovered.tools,
        );
        const messageId = String(saved.message.messageId);
        const result = await bindTool(
          { toolCall, state: { messageId }, runtime: { writer: vi.fn() } },
          (request) => status(request, executed),
        );
        return {
          result,
          stored: await messages.getToolCallResult(messageId, toolCall.id),
        };
      },
    };
  }
  return { aiManager, data, persistence, runtime };
}

describe('package-owned data skill runtime', () => {
  it('statically registers the three GENERAL skills and every mapped tool exactly once', async () => {
    const { aiManager } = await createFixture();
    await new AIEmployeeResources().registerAIResources(aiManager);
    const skills = await aiManager.skillsManager.listSkills({
      scope: 'GENERAL',
    });
    const tools = await aiManager.toolsManager.listTools({});
    for (const [name, names] of Object.entries(skillTools)) {
      const matches = skills.filter((skill) => skill.name === name);
      expect(matches).toHaveLength(1);
      expect(matches[0]).toMatchObject({
        scope: 'GENERAL',
        tools: names,
        content: expect.any(String),
      });
      expect(matches[0].content.length).toBeGreaterThan(100);
      for (const toolName of names) {
        const entries = tools.filter(
          (tool) => tool.definition.name === toolName,
        );
        expect(entries).toHaveLength(1);
        expect(entries[0].invoke).toBeTypeOf('function');
      }
    }
  });

  it('keeps inactive data and report tools out of model calls and blocks direct execution', async () => {
    const fixture = await createFixture();
    const runtime = await fixture.runtime();
    expect(await runtime.visibleTools()).toContain('getSkill');
    for (const name of gatedTools) {
      expect(runtime.discovered.tools.has(name)).toBe(true);
      expect(await runtime.visibleTools()).not.toContain(name);
      const { result } = await runtime.call(name);
      expect(result).toMatchObject({
        status: 'error',
        content: 'Tool unavailable.',
      });
    }
    expect(runtime.executed).not.toHaveBeenCalled();
    for (const method of Object.values(fixture.data))
      expect(method).not.toHaveBeenCalled();
  });

  it('runs getSkill → metadata → getSkill → query → getSkill → report using production execution and persistence', async () => {
    const fixture = await createFixture();
    const runtime = await fixture.runtime();
    const snapshot = runtime.discovered.tools;
    expect(
      (await runtime.availableSkills()).map((skill) => skill.name),
    ).toEqual(expect.arrayContaining(Object.keys(skillTools)));

    for (const name of Object.keys(skillTools)) {
      const { stored } = await runtime.call('getSkill', { skillName: name });
      expect(stored).toMatchObject({
        status: 'success',
        invokeStatus: 'done',
        content: {
          skillName: name,
          activatedTools: skillTools[name as keyof typeof skillTools],
        },
      });
      expect(await runtime.visibleTools()).toEqual(
        expect.arrayContaining(skillTools[name as keyof typeof skillTools]),
      );
      if (name === 'data-metadata') {
        const { stored: metadata } = await runtime.call(
          'getCollectionMetadata',
          { collection: 'orders' },
        );
        expect(metadata).toMatchObject({
          status: 'success',
          content: {
            name: 'orders',
            fields: { items: [{ name: 'amount', type: 'double' }] },
          },
        });
        expect(await runtime.visibleTools()).not.toContain('dataQuery');
      }
      if (name === 'data-query') {
        const { stored: query } = await runtime.call('dataQuery', {
          collection: 'orders',
          aggregates: [{ function: 'sum', field: 'amount', alias: 'total' }],
        });
        expect(query).toMatchObject({
          status: 'success',
          content: { items: [{ total: 42 }] },
        });
        expect(await runtime.visibleTools()).not.toContain(
          'businessReportGenerator',
        );
      }
    }
    const { stored: report } = await runtime.call('businessReportGenerator', {
      title: 'Order revenue',
      markdown: 'Total revenue is 42. {{chart:1}}',
      charts: [
        {
          options: {
            xAxis: { type: 'category', data: ['Total'] },
            yAxis: { type: 'value' },
            series: [{ type: 'bar', data: [42] }],
          },
        },
      ],
    });
    expect(report).toMatchObject({
      status: 'success',
      content: {
        success: true,
        chartCount: 1,
        report: {
          title: 'Order revenue',
          markdown: 'Total revenue is 42. {{chart:1}}',
        },
      },
    });
    expect(fixture.data.getCollectionMetadata).toHaveBeenCalledOnce();
    expect(fixture.data.dataQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'orders',
        aggregates: [{ function: 'sum', field: 'amount', alias: 'total' }],
      }),
    );
    expect(runtime.discovered.tools).toBe(snapshot);
    expect(
      fixture.persistence
        .toolMessagesFor('analysis')
        .filter(
          (item) => item.toolName === 'getSkill' && item.status === 'success',
        ),
    ).toHaveLength(3);
  });

  it('executes every metadata and query mapping through its registered schema and actor-bound service', async () => {
    const fixture = await createFixture();
    const runtime = await fixture.runtime();
    await runtime.call('getSkill', { skillName: 'data-metadata' });
    await runtime.call('getSkill', { skillName: 'data-query' });
    const calls = [
      ['getDataSources', {}],
      ['getCollectionNames', { dataSource: 'main' }],
      ['getCollectionMetadata', { collection: 'orders' }],
      ['searchFieldMetadata', { collection: 'orders', query: 'amount' }],
      [
        'dataSourceQuery',
        { collection: 'orders', fields: ['amount'], limit: 10 },
      ],
      ['dataSourceCounting', { collection: 'orders' }],
      [
        'dataQuery',
        {
          collection: 'orders',
          aggregates: [{ function: 'sum', field: 'amount', alias: 'total' }],
        },
      ],
    ] as const;
    for (const [name, args] of calls) {
      expect((await runtime.call(name, args)).stored).toMatchObject({
        status: 'success',
        invokeStatus: 'done',
      });
      expect(fixture.data[name]).toHaveBeenCalledOnce();
      expect(fixture.data[name]).toHaveBeenCalledWith(args);
    }
  });

  it('rejects model-supplied identity and raw SQL before invoking data services', async () => {
    const fixture = await createFixture();
    const runtime = await fixture.runtime();
    await runtime.call('getSkill', { skillName: 'data-query' });
    for (const extra of [
      { actor: { id: 'root', isRoot: true } },
      { sql: 'SELECT * FROM orders' },
    ]) {
      const { result, stored } = await runtime.call('dataSourceQuery', {
        collection: 'orders',
        fields: ['amount'],
        ...extra,
      });
      expect(result.status).toBe('error');
      expect(stored?.status).toBe('error');
    }
    expect(fixture.data.dataSourceQuery).not.toHaveBeenCalled();
  });

  it('does not activate tools for an unsuccessful getSkill call or another session', async () => {
    const fixture = await createFixture();
    const runtime = await fixture.runtime();
    const { result, stored } = await runtime.call('getSkill', {
      skillName: 'not-a-skill',
    });
    expect(JSON.parse(result.content as string)).toMatchObject({
      status: 'error',
      content: { message: 'Skill not found' },
    });
    expect(stored?.status).not.toBe('success');
    expect(await runtime.visibleTools()).not.toContain('dataQuery');
    await runtime.call('getSkill', { skillName: 'data-query' });
    expect(await runtime.visibleTools()).toContain('dataQuery');
    const other = await fixture.runtime(undefined, 'other-session');
    expect(await other.visibleTools()).not.toContain('dataQuery');
    expect((await other.call('dataQuery')).result).toMatchObject({
      status: 'error',
      content: 'Tool unavailable.',
    });
    expect(fixture.data.dataQuery).not.toHaveBeenCalled();
  });

  it.each([
    ['skills', { skillsVersion: 1, skills: [] }],
    ['tools', { toolsVersion: 1, tools: [] }],
  ] as const)(
    'does not let persisted activation bypass session-disabled %s',
    async (_kind, settings) => {
      const fixture = await createFixture();
      const first = await fixture.runtime();
      for (const name of Object.keys(skillTools))
        await first.call('getSkill', { skillName: name });
      expect(await first.visibleTools()).toEqual(
        expect.arrayContaining(gatedTools),
      );
      const disabled = await fixture.runtime(
        settings as AIEmployeeSkillSettings,
      );
      for (const name of gatedTools) {
        expect(await disabled.visibleTools()).not.toContain(name);
        expect((await disabled.call(name)).result).toMatchObject({
          status: 'error',
          content: 'Tool unavailable.',
        });
      }
      expect(disabled.executed).not.toHaveBeenCalled();
      for (const method of Object.values(fixture.data))
        expect(method).not.toHaveBeenCalled();
    },
  );
});

it('runs the activated query/report chain against real SQLite and real user authorization', async () => {
  const database = createDatabaseManager({
    drivers: { sqlite },
    default: 'main',
    connections: { main: { dialect: 'sqlite', filename: ':memory:' } },
  });
  try {
    await database.connect();
    const authRoot = dirname(
      createRequire(import.meta.url).resolve(
        '@nocobase/app-plugin-authorization/package.json',
      ),
    );
    await database
      .createMigrator({
        directory: join(authRoot, 'database/migrations'),
        packageName: '@nocobase/app-plugin-authorization',
      })
      .upTo('202608210004_create_restriction_rules');
    await database.builder().createCollection('orders', (collection) => {
      collection.string('id').primary();
      collection.string('ownerId');
      collection.integer('amount');
    });
    await database.repository('orders').createOne({
      values: { id: 'mine', ownerId: 'fixture-user', amount: 42 },
    });
    await database.repository('orders').createOne({
      values: { id: 'theirs', ownerId: 'other-user', amount: 900 },
    });
    const authorization = createAppAuthorization({
      connection: database.connection(),
    });
    authorization.database.collections.add({
      name: 'main.orders',
      actions: ['read'],
      fields: ['id', 'ownerId', 'amount'],
      attributes: { owner: 'ownerId' },
    });
    await authorization.permissionSets.create({
      key: 'own-orders',
      grants: [
        authorization.database.grant('main.orders', {
          read: {
            fields: { output: ['id', 'amount'] },
            recordAccess: ['recordsIOwn'],
          },
        }),
      ],
    });
    await authorization.permissionSets.assign({
      permissionSet: 'own-orders',
      subject: { type: 'user', id: 'fixture-user' },
    });
    const data = createDataServices({
      database,
      authorization,
      actor: { id: 'fixture-user', roles: [], isRoot: false },
    });
    const fixture = await createFixture(data);
    const runtime = await fixture.runtime();
    await runtime.call('getSkill', { skillName: 'data-metadata' });
    expect((await runtime.call('getDataSources')).stored).toMatchObject({
      status: 'success',
      content: { items: [{ name: 'main' }] },
    });
    await runtime.call('getSkill', { skillName: 'data-query' });
    const query = await runtime.call('dataQuery', {
      collection: 'orders',
      aggregates: [{ function: 'sum', field: 'amount', alias: 'total' }],
    });
    expect(query.stored).toMatchObject({
      status: 'success',
      content: { items: [{ total: '42' }] },
    });
    const total = (query.stored?.content as { items: { total: string }[] })
      .items[0].total;
    await runtime.call('getSkill', { skillName: 'business-analysis-report' });
    const report = await runtime.call('businessReportGenerator', {
      title: 'My orders',
      markdown: `Authorized total: ${total}. {{chart:1}}`,
      charts: [
        {
          options: {
            series: [
              {
                type: 'pie',
                data: [{ name: 'Authorized amount', value: total }],
              },
            ],
          },
        },
      ],
    });
    expect(report.stored).toMatchObject({
      status: 'success',
      content: {
        success: true,
        chartCount: 1,
        report: { markdown: 'Authorized total: 42. {{chart:1}}' },
      },
    });
    expect(JSON.stringify(report.stored?.content)).not.toContain('900');
  } finally {
    await database.destroy();
  }
});

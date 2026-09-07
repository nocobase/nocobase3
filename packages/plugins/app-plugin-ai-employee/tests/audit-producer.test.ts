import { describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { AIMessage } from '@langchain/core/messages';
import {
  FakeListChatModel,
  FakeStreamingChatModel,
} from '@langchain/core/utils/testing';
import { LLMProvider as NestedLLMProvider } from '@nocobase/ai-employee';
import {
  createAgentProviders,
  createMemoryConversationProvider,
} from '../server/agent/providers.js';
import { createAgentService } from '../server/agent/agent-service.js';
import {
  bindAIRequestAudit,
  bindAIConversationAudit,
  runAuditedAI,
  beginAIToolAttempt,
} from '../server/audit-runtime.js';
import { dialects } from '../../app-plugin-audit/tests/helpers/database-fixtures.js';
import { auditRaw } from '../../app-plugin-audit/server/database/sql-client.js';
import { createAIAuditFixture } from './helpers/audit-fixture.js';

const sentinel = 'AGENT_SYNTHETIC_PROMPT_SECRET';
for (const dialect of dialects)
  describe(`AI producer ${dialect}`, () => {
    it('keeps distinct attempts and never replays a completed side effect on observation failure', async () => {
      const f = await createAIAuditFixture(dialect);
      const log = vi
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);
      try {
        const context = {};
        bindAIRequestAudit(context, f.bridge);
        const conversation = createMemoryConversationProvider();
        bindAIConversationAudit(
          conversation,
          context,
          'trusted-employee',
          'audit-test-retry',
        );
        let effects = 0;
        await f.runtime.runRequest(() =>
          runAuditedAI(conversation, async () => {
            const first = await beginAIToolAttempt('syntheticTool');
            await first?.('failed');
            const second = await beginAIToolAttempt('syntheticTool');
            effects++;
            await second?.('success');
            await second?.('success');
          }),
        );
        const events = (
          await f.fixture.f.store.query(f.fixture.f.scope, { store: 'main' })
        ).items;
        expect(
          events
            .filter((e) => e.action === 'ai.tool.result')
            .map((e) => e.outcome)
            .sort(),
        ).toEqual(['failed', 'success']);
        await auditRaw(f.fixture.f.connection, 'DROP TABLE "auditEvents"');
        await f.runtime.runRequest(() =>
          runAuditedAI(conversation, async () => {
            effects++;
          }),
        );
        expect(effects).toBe(2);
        expect(JSON.stringify(log.mock.calls)).not.toContain(sentinel);
        expect(log).toHaveBeenCalled();
      } finally {
        log.mockRestore();
        await f.cleanup();
      }
    }, 120000);
  });

for (const dialect of dialects)
  describe(`application adapter ${dialect}`, () => {
    it('executes persisted new and legacy agents with actual tool failure and retry', async () => {
      const f = await createAIAuditFixture(dialect);
      try {
        const { prepareAIRuntime } = await import('./helpers/audit-fixture.js');
        const { createAIEmployeeAgentService } =
          await import('../server/agent/ai-employee/index.js');
        const { AIEmployee } =
          await import('../server/ai-employees/ai-employee.js');
        const a = await prepareAIRuntime(f);
        const log = vi.spyOn(a.runtime.logger, 'error');
        a.runtime.currentUser = {
          id: f.fixture.alice.id,
          roles: ['member'],
          isRoot: false,
        };
        a.runtime.auth = { user: { id: f.fixture.alice.id } };
        a.runtime.state.currentUser = { id: f.fixture.alice.id };
        bindAIRequestAudit(a.runtime, f.bridge);
        a.runtime.requestExecution = {
          streamTarget: { write: () => undefined, end: () => undefined },
        };
        for (const legacy of [false, true]) {
          const sessionId = randomUUID();
          await a.runtime.repositories.aiConversations.create({
            values: {
              sessionId,
              userId: f.fixture.alice.id,
              aiEmployeeUsername: 'trusted-employee',
              thread: 1,
            },
          });
          const options = {
            ctx: a.runtime,
            employee: {
              skillSettings: { skills: [], tools: [] },
              username: 'trusted-employee',
              chatSettings: {
                systemPromptMode: 'none' as const,
                enableSkills: false,
              },
            },
            sessionId,
            model: { llmService: 'audit-test-model', model: 'audit-test' },
            tools: [{ name: 'auditTestTool' }],
          };
          await f.runtime.runRequest(() =>
            f.runtime.runAuthenticated(
              { actor: { type: 'user', id: f.fixture.alice.id } },
              async () => {
                const agent = legacy
                  ? new AIEmployee(options)
                  : (await createAIEmployeeAgentService(options)).service;
                await agent.invoke({
                  userMessages: [
                    {
                      role: 'user',
                      content: { type: 'text', content: sentinel },
                      metadata: {},
                    },
                  ],
                });
              },
            ),
          );
        }
        expect(a.effects()).toBe(4);
        const events = (
          await f.fixture.f.store.query(f.fixture.f.scope, { store: 'main' })
        ).items;
        expect(
          events.filter((e) => e.action === 'ai.run.finished'),
        ).toHaveLength(2);
        expect(
          events
            .filter((e) => e.action === 'ai.tool.result')
            .map((e) => e.outcome)
            .sort(),
        ).toEqual(['failed', 'failed', 'success', 'success']);
        expect(JSON.stringify(events)).not.toContain(
          'AGENT_MODEL_PROMPT_ARGS_OUTPUT_SENTINEL',
        );
        expect(JSON.stringify(log.mock.calls)).not.toContain(
          'AGENT_MODEL_PROMPT_ARGS_OUTPUT_SENTINEL',
        );
        log.mockRestore();
      } finally {
        await f.cleanup();
      }
    }, 120000);
  });

for (const dialect of dialects)
  describe(`production HTTP ${dialect}`, () => {
    it('audits real declared routes with authenticated user identity and safe failed input', async () => {
      const f = await createAIAuditFixture(dialect);
      try {
        const { prepareAIRuntime } = await import('./helpers/audit-fixture.js');
        const { aiEmployeeApiRoutes } =
          await import('../server/routes/plugin.js');
        const { aiEmployeeRuntimeToken } = await import('../server/tokens.js');
        const { aiEmployeeAuditToken } = await import('../server/audit.js');
        const { Application } =
          await import('@nocobase/app-server/application');
        const { authenticationToken } =
          await import('@nocobase/app-plugin-authentication/server');
        const a = await prepareAIRuntime(f);
        const app = new Application({
          config: f.fixture.app.config,
          paths: a.deps.paths,
          websocket: () => async () => null,
        });
        app.addHttpObserver(f.fixture.http.collector);
        app.container.instance(authenticationToken, a.deps.auth);
        f.fixture.app = app;
        f.fixture.app.container.instance(aiEmployeeRuntimeToken, a.runtime);
        f.fixture.app.container.instance(aiEmployeeAuditToken, f.bridge);
        app.addRoutes(aiEmployeeApiRoutes);
        const response = await f.fixture.app.fetch(
          new Request('http://localhost/api/ai/aiEmployees:updateUserPrompt', {
            method: 'POST',
            headers: {
              cookie: f.fixture.alice.cookie,
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              aiEmployee: 'trusted-employee',
              prompt: sentinel,
              actor: { type: 'agent', id: 'code-generator' },
            }),
          }),
        );
        expect(response.status).toBe(200);
        const invalid = await f.fixture.app.fetch(
          new Request('http://localhost/api/ai/aiEmployees:updateUserPrompt', {
            method: 'POST',
            headers: {
              cookie: f.fixture.alice.cookie,
              'content-type': 'application/json',
            },
            body: JSON.stringify({ prompt: sentinel }),
          }),
        );
        expect(invalid.status).toBe(500);
        const anonymous = await f.fixture.app.fetch(
          new Request('http://localhost/api/ai/aiConversations:get'),
        );
        expect(anonymous.status).toBe(500);
        const events = (
          await f.fixture.f.store.query(f.fixture.f.scope, { store: 'main' })
        ).items;
        const promptEvents = events.filter(
          (e) => e.action === 'ai.aiEmployees.updateUserPrompt',
        );
        expect(promptEvents.map((e) => e.outcome).sort()).toEqual([
          'failed',
          'success',
        ]);
        expect(
          promptEvents.every(
            (e) => e.actor.type === 'user' && e.actor.id === f.fixture.alice.id,
          ),
        ).toBe(true);
        expect(
          events.find((e) => e.action === 'ai.aiConversations.get')?.actor.type,
        ).toBe('anonymous');
        expect(JSON.stringify(events)).not.toMatch(
          /code-generator|AGENT_SYNTHETIC_PROMPT_SECRET/,
        );
        const sessionId = randomUUID();
        await a.runtime.repositories.aiConversations.create({
          values: {
            sessionId,
            userId: f.fixture.alice.id,
            aiEmployeeUsername: 'trusted-employee',
            thread: 1,
            from: 'main-agent',
            category: 'chat',
          },
        });
        const sent = await app.fetch(
          new Request('http://localhost/api/ai/aiConversations:sendMessages', {
            method: 'POST',
            headers: {
              cookie: f.fixture.alice.cookie,
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              sessionId,
              aiEmployee: 'trusted-employee',
              model: { llmService: 'audit-test-model', model: 'audit-test' },
              messages: [
                {
                  role: 'user',
                  content: { type: 'text', content: sentinel },
                  metadata: {},
                },
              ],
              actor: { type: 'agent', id: 'code-generator' },
            }),
          }),
        );
        expect(sent.status).toBe(200);
        await sent.text();
        const sentEvents = (
          await f.fixture.f.store.query(f.fixture.f.scope, { store: 'main' })
        ).items;
        expect(
          sentEvents.filter((e) => e.action === 'ai.run.started'),
        ).toHaveLength(1);
        const requestEvent = sentEvents.find(
          (e) => e.action === 'ai.aiConversations.sendMessages',
        );
        const run = sentEvents.find((e) => e.action === 'ai.run.finished');
        expect(run).toMatchObject({
          outcome: 'success',
          actor: { type: 'agent', id: 'trusted-employee' },
          initiator: { type: 'user', id: f.fixture.alice.id },
          operationId: requestEvent?.operationId,
          requestId: requestEvent?.requestId,
        });
        const plain = new Application({
          config: app.config,
          paths: a.deps.paths,
          websocket: () => async () => null,
        });
        plain.container.instance(authenticationToken, a.deps.auth);
        plain.container.instance(aiEmployeeRuntimeToken, a.runtime);
        plain.addRoutes(aiEmployeeApiRoutes);
        try {
          for (const [body, expected] of [
            [{ aiEmployee: 'trusted-employee', prompt: sentinel }, response],
            [{ prompt: sentinel }, invalid],
          ] as const) {
            const actual = await plain.fetch(
              new Request(
                'http://localhost/api/ai/aiEmployees:updateUserPrompt',
                {
                  method: 'POST',
                  headers: {
                    cookie: f.fixture.alice.cookie,
                    'content-type': 'application/json',
                  },
                  body: JSON.stringify(body),
                },
              ),
            );
            expect(actual.status).toBe(expected.status);
            expect(await actual.text()).toBe(await expected.text());
          }
          const actual = await plain.fetch(
            new Request('http://localhost/api/ai/aiConversations:get'),
          );
          expect(actual.status).toBe(anonymous.status);
          expect(await actual.text()).toBe(await anonymous.text());
          expect(
            (
              await f.fixture.f.store.query(f.fixture.f.scope, {
                store: 'main',
              })
            ).items,
          ).toHaveLength(sentEvents.length);
        } finally {
          await plain.shutdown();
        }
        await app.shutdown();
      } finally {
        await f.cleanup();
      }
    }, 120000);
  });

for (const dialect of dialects)
  describe(`stream lifecycle ${dialect}`, () => {
    it('distinguishes full consumption, interruption, cancellation and separate concurrent requests', async () => {
      const f = await createAIAuditFixture(dialect);
      try {
        const { prepareAIRuntime } = await import('./helpers/audit-fixture.js');
        const { createAIEmployeeAgentService } =
          await import('../server/agent/ai-employee/index.js');
        const { AIEmployee } =
          await import('../server/ai-employees/ai-employee.js');
        const a = await prepareAIRuntime(f);
        a.runtime.requestExecution = {
          streamTarget: { write: () => undefined, end: () => undefined },
        };
        bindAIRequestAudit(a.runtime, f.bridge);
        for (const legacy of [false, true]) {
          const sessionId = randomUUID();
          await a.runtime.repositories.aiConversations.create({
            values: {
              sessionId,
              userId: f.fixture.alice.id,
              aiEmployeeUsername: 'trusted-employee',
              thread: 1,
            },
          });
          const options = {
            ctx: a.runtime,
            employee: {
              skillSettings: { skills: [], tools: [] },
              username: 'trusted-employee',
              chatSettings: {
                systemPromptMode: 'none' as const,
                enableSkills: false,
              },
            },
            sessionId,
            model: { llmService: 'audit-test-model', model: 'audit-test' },
            tools: [{ name: 'auditTestTool' }],
          };
          await f.runtime.runRequest(() =>
            f.runtime.runAuthenticated(
              { actor: { type: 'user', id: f.fixture.alice.id } },
              async () => {
                const request = {
                  userMessages: [
                    {
                      role: 'user',
                      content: { type: 'text', content: sentinel },
                      metadata: {},
                    },
                  ],
                };
                if (legacy)
                  expect(await new AIEmployee(options).stream(request)).toBe(
                    true,
                  );
                else {
                  const { service } =
                    await createAIEmployeeAgentService(options);
                  for await (const event of service.stream(request))
                    expect(event.type).toBeTruthy();
                }
              },
            ),
          );
        }
        const events = (
          await f.fixture.f.store.query(f.fixture.f.scope, { store: 'main' })
        ).items;
        expect(
          events
            .filter((e) => e.action === 'ai.run.finished')
            .map((e) => e.outcome),
        ).toEqual(['success', 'success']);
        expect(f.runtime.current().actor.type).toBe('unknown');
      } finally {
        await f.cleanup();
      }
    }, 120000);
  });

for (const dialect of dialects)
  describe(`isolated stream scopes ${dialect}`, () => {
    it('keeps overlapping run identities separate and records consumer cancellation as unknown', async () => {
      const f = await createAIAuditFixture(dialect);
      try {
        const { FakeStreamingChatModel } =
          await import('@langchain/core/utils/testing');
        const { LLMProvider } = await import('@nocobase/ai-employee');
        class PlainProvider extends LLMProvider {
          createModel(): InstanceType<typeof FakeStreamingChatModel> {
            return new FakeStreamingChatModel({
              responses: [new AIMessage('synthetic output')],
              sleep: 1,
            });
          }
        }
        const execute = async (id: string, cancel: boolean, bridge: boolean) =>
          f.runtime.runRequest(() =>
            f.runtime.runAuthenticated(
              { actor: { type: 'user', id } },
              async () => {
                const providers = createAgentProviders({
                  llmProvider: new PlainProvider({}),
                  llmIdentity: { model: 'fake', providerName: 'fake' },
                });
                const context = {};
                if (bridge) bindAIRequestAudit(context, f.bridge);
                bindAIConversationAudit(
                  providers.conversation,
                  context,
                  `employee-${id}`,
                  id,
                );
                const iterator = createAgentService(providers).stream({
                  userMessages: [
                    {
                      role: 'user',
                      content: { type: 'text', content: sentinel },
                      metadata: {},
                    },
                  ],
                });
                for await (const event of iterator) {
                  if (cancel && event.type === 'stream_start') break;
                }
                expect(f.runtime.current().actor).toEqual({ type: 'user', id });
              },
            ),
          );
        await Promise.all([
          execute('one', false, true),
          execute('two', true, true),
          execute('code-generator', false, false),
        ]);
        const events = (
          await f.fixture.f.store.query(f.fixture.f.scope, { store: 'main' })
        ).items;
        expect(
          events
            .filter((e) => e.action === 'ai.run.finished')
            .map((e) => e.outcome)
            .sort(),
        ).toEqual(['success', 'unknown']);
        expect(
          events.every((e) => e.actor.id === `employee-${e.initiator?.id}`),
        ).toBe(true);
        expect(new Set(events.map((e) => e.runId)).size).toBe(2);
        expect(new Set(events.map((e) => e.requestId)).size).toBe(2);
        expect(JSON.stringify(events)).not.toContain('code-generator');
        expect(f.runtime.current().actor.type).toBe('unknown');
      } finally {
        await f.cleanup();
      }
    }, 120000);
  });

for (const dialect of dialects)
  describe(`approval boundary ${dialect}`, () => {
    it('records waiting-for-human as accepted and the resumed invocation as a separate run', async () => {
      const f = await createAIAuditFixture(dialect);
      try {
        const { prepareAIRuntime } = await import('./helpers/audit-fixture.js');
        const { createAIEmployeeAgentService } =
          await import('../server/agent/ai-employee/index.js');
        const { AIEmployee } =
          await import('../server/ai-employees/ai-employee.js');
        const a = await prepareAIRuntime(f);
        a.runtime.requestExecution = {
          streamTarget: { write: () => undefined, end: () => undefined },
        };
        bindAIRequestAudit(a.runtime, f.bridge);
        const tool = await a.deps.ai.toolsManager.getTools('auditTestTool');
        if (!tool) throw new Error('Missing synthetic tool');
        await a.deps.ai.toolsManager.registerTools({
          ...tool,
          defaultPermission: 'ASK',
        });
        for (const legacy of [false, true]) {
          const sessionId = randomUUID();
          await a.runtime.repositories.aiConversations.create({
            values: {
              sessionId,
              userId: f.fixture.alice.id,
              aiEmployeeUsername: 'trusted-employee',
              thread: 1,
            },
          });
          const options = {
            ctx: a.runtime,
            employee: {
              username: 'trusted-employee',
              skillSettings: { skills: [], tools: [] },
              chatSettings: {
                systemPromptMode: 'none' as const,
                enableSkills: false,
              },
            },
            sessionId,
            model: { llmService: 'audit-test-model', model: 'audit-test' },
            tools: [{ name: 'auditTestTool' }],
          };
          await f.runtime.runRequest(() =>
            f.runtime.runAuthenticated(
              { actor: { type: 'user', id: f.fixture.alice.id } },
              async () => {
                const request = {
                  userMessages: [
                    {
                      role: 'user',
                      content: { type: 'text', content: sentinel },
                      metadata: {},
                    },
                  ],
                };
                if (legacy)
                  expect(await new AIEmployee(options).stream(request)).toBe(
                    true,
                  );
                else {
                  const { service } =
                    await createAIEmployeeAgentService(options);
                  const result = await service.invoke(request);
                  expect(result).toHaveProperty('__interrupt__');
                  await service.resumeInvoke({
                    userDecisions: { decisions: [{ type: 'approve' }] },
                  });
                }
              },
            ),
          );
        }
        const events = (
          await f.fixture.f.store.query(f.fixture.f.scope, { store: 'main' })
        ).items;
        expect(
          events
            .filter((e) => e.action === 'ai.run.finished')
            .map((e) => e.outcome),
        ).toEqual(['accepted', 'accepted', 'accepted']);
        expect(
          events.filter((e) => e.action === 'ai.tool.result'),
        ).toHaveLength(1);
        expect(a.effects()).toBe(1);
      } finally {
        await f.cleanup();
      }
    }, 120000);
  });

for (const dialect of dialects)
  describe(`persistence fault ${dialect}`, () => {
    it('reports failed conversation persistence without changing the existing returned model result', async () => {
      const f = await createAIAuditFixture(dialect);
      try {
        const { prepareAIRuntime } = await import('./helpers/audit-fixture.js');
        const { createAIEmployeeAgentService } =
          await import('../server/agent/ai-employee/index.js');
        const { AIEmployee } =
          await import('../server/ai-employees/ai-employee.js');
        const { LLMProvider } = await import('@nocobase/ai-employee');
        class PlainProvider extends LLMProvider {
          createModel(): FakeListChatModel {
            return new FakeListChatModel({ responses: [sentinel] });
          }
        }
        const a = await prepareAIRuntime(f);
        a.deps.ai.llmProviderManager.registerLLMProvider('audit-test', {
          title: 'Synthetic',
          provider: PlainProvider,
        });
        a.runtime.requestExecution = {
          streamTarget: { write: () => undefined, end: () => undefined },
        };
        bindAIRequestAudit(a.runtime, f.bridge);
        const logger = vi.spyOn(a.runtime.logger, 'error');
        try {
          for (const legacy of [false, true])
            for (const audited of [false, true]) {
              const sessionId = randomUUID();
              await a.runtime.repositories.aiConversations.create({
                values: {
                  sessionId,
                  userId: f.fixture.alice.id,
                  aiEmployeeUsername: 'trusted-employee',
                  thread: 1,
                },
              });
              const options = {
                ctx: audited ? a.runtime : { ...a.runtime },
                employee: {
                  username: 'trusted-employee',
                  skillSettings: { skills: [], tools: [] },
                  chatSettings: {
                    systemPromptMode: 'none' as const,
                    enableSkills: false,
                    enableTools: false,
                  },
                },
                sessionId,
                model: { llmService: 'audit-test-model', model: 'audit-test' },
              };
              const create = a.runtime.repositories.aiMessages.create.bind(
                a.runtime.repositories.aiMessages,
              );
              const fault = vi
                .spyOn(a.runtime.repositories.aiMessages, 'create')
                .mockImplementationOnce(create)
                .mockRejectedValueOnce(new Error(sentinel));
              try {
                await f.runtime.runRequest(() =>
                  f.runtime.runAuthenticated(
                    { actor: { type: 'user', id: f.fixture.alice.id } },
                    async () => {
                      const agent = legacy
                        ? new AIEmployee(options)
                        : (await createAIEmployeeAgentService(options)).service;
                      expect(
                        await agent.invoke({
                          userMessages: [
                            {
                              role: 'user',
                              content: { type: 'text', content: sentinel },
                              metadata: {},
                            },
                          ],
                        }),
                      ).toHaveProperty('messages');
                    },
                  ),
                );
              } finally {
                fault.mockRestore();
              }
            }
          const events = (
            await f.fixture.f.store.query(f.fixture.f.scope, { store: 'main' })
          ).items;
          expect(
            events.filter((e) => e.action === 'ai.conversation.persist'),
          ).toHaveLength(2);
          expect(
            events
              .filter((e) => e.action === 'ai.run.finished')
              .map((e) => e.outcome),
          ).toEqual(['failed', 'failed']);
          expect(JSON.stringify(events)).not.toContain(sentinel);
          expect(JSON.stringify(logger.mock.calls)).not.toContain(sentinel);
        } finally {
          logger.mockRestore();
        }
      } finally {
        await f.cleanup();
      }
    }, 120000);
  });

class NestedPlainProvider extends NestedLLMProvider {
  createModel(): FakeStreamingChatModel {
    return new FakeStreamingChatModel({
      responses: [new AIMessage('synthetic')],
      sleep: 1,
    });
  }
}
for (const dialect of dialects)
  describe(`nested owner ${dialect}`, () => {
    it('does not let an unbound nested stream mark the successful bound parent as failed', async () => {
      const f = await createAIAuditFixture(dialect);
      try {
        const parent = {};
        let nestedError = false;
        await f.runtime.runRequest(() =>
          f.runtime.runAuthenticated(
            { actor: { type: 'user', id: 'parent-owner' } },
            async () => {
              const context = {};
              bindAIRequestAudit(context, f.bridge);
              bindAIConversationAudit(
                parent,
                context,
                'parent-agent',
                'parent-session',
              );
              await runAuditedAI(parent, async () => {
                const child = createAgentService(
                  createAgentProviders({
                    llmProvider: new NestedPlainProvider({}),
                    llmIdentity: { model: 'fake', providerName: 'fake' },
                  }),
                );
                const abort = new AbortController();
                abort.abort();
                const chunks: unknown[] = [];
                try {
                  for await (const chunk of child.stream({
                    signal: abort.signal,
                    userMessages: [
                      {
                        role: 'user',
                        content: { type: 'text', content: 'synthetic' },
                        metadata: {},
                      },
                    ],
                  })) {
                    chunks.push(chunk);
                  }
                } catch {
                  nestedError = true;
                }
                expect(chunks).toHaveLength(0);
                return { recovered: true };
              });
            },
          ),
        );
        const events = (
          await f.fixture.f.store.query(f.fixture.f.scope, { store: 'main' })
        ).items;
        const finished = events.filter((e) => e.action === 'ai.run.finished');
        expect(nestedError).toBe(true);
        expect(finished).toHaveLength(1);
        expect(finished[0].outcome).toBe('success');
      } finally {
        await f.cleanup();
      }
    });
  });

import { describe, expect, it } from 'vitest';
import { defineTools } from '@nocobase/ai-employee';
import {
  createTestActor,
  createTestAgentContext,
  createTestConversationTurn,
} from './app/test-context.js';

const contextTool = defineTools({
  scope: 'GENERAL',
  definition: { name: 'read-context', description: 'read context' },
  invoke: async (ctx) => ({ sessionId: ctx.state.sessionId }),
});

const contextFreeTool = defineTools({
  scope: 'GENERAL',
  requiresContext: false,
  definition: { name: 'context-free', description: 'context free' },
  invoke: async () => 'ok',
});

describe('AgentContext adapter', () => {
  it('maps actor and turn into state, with the caller naming the session', () => {
    const agentContext = createTestAgentContext({
      actor: createTestActor({
        id: 7,
        roles: ['admin'],
        locale: 'en-US',
      }),
      turn: createTestConversationTurn({ messageId: 'message-1' }),
      decided: { sessionId: 'sub' },
    });

    expect(agentContext.actor).toEqual({
      id: 7,
      roles: ['admin'],
      isRoot: false,
      locale: 'en-US',
    });
    expect(agentContext.state.sessionId).toBe('sub');
    expect(agentContext.state.messageId).toBe('message-1');
    // A turn carries no transport, so the stream target and the abort signal
    // stop at the conversation service and cannot reach a tool.
    expect(agentContext.state).not.toHaveProperty('streamTarget');
    expect(agentContext.state).not.toHaveProperty('abortSignal');
    // The context carries this execution and nothing ambient: a tool reaches a
    // manager, repository or the database only by declaring its token.
    expect(agentContext.deps).toEqual({});
    expect(agentContext).not.toHaveProperty('database');
    expect(agentContext).not.toHaveProperty('ai');
    expect(agentContext).not.toHaveProperty('repositories');
    expect(agentContext).not.toHaveProperty('services');
  });
});

describe('AgentService AgentContext propagation', () => {
  it('passes request-scoped contexts independently and reports missing context clearly', async () => {
    const contextA = createTestAgentContext({ decided: { sessionId: 'A' } });
    const contextB = createTestAgentContext({ decided: { sessionId: 'B' } });
    const { buildTool } = await import('@nocobase/ai-employee');
    type Built = {
      invoke: (
        input: unknown,
        config: unknown,
      ) => Promise<{ content: unknown }>;
    };
    // A tool is bound to its context when it is built, so two executions hold
    // two tools and neither can be handed the other's context by a request.
    const builtA = buildTool(contextTool, contextA) as unknown as Built;
    const builtB = buildTool(contextTool, contextB) as unknown as Built;
    const [a, b] = await Promise.all([
      builtA.invoke(
        {},
        { context: { agentContext: contextB }, toolCall: { id: 'a' } },
      ),
      builtB.invoke({}, { context: {}, toolCall: { id: 'b' } }),
    ]);
    expect(a.content).toBe('{"sessionId":"A"}');
    expect(b.content).toBe('{"sessionId":"B"}');
    await expect(
      (buildTool(contextTool) as unknown as Built).invoke(
        {},
        { context: {}, toolCall: { id: 'missing' } },
      ),
    ).rejects.toThrow(
      'Agent context is required to execute tool "read-context"',
    );
  });

  it('allows explicitly context-free tools to run without AgentContext', async () => {
    const built = (await import('@nocobase/ai-employee')).buildTool(
      contextFreeTool,
    ) as unknown as {
      invoke: (
        input: unknown,
        config: unknown,
      ) => Promise<{ content: unknown }>;
    };
    const result = await built.invoke(
      {},
      { context: {}, toolCall: { id: 'free' } },
    );
    expect(result.content).toBe('ok');
  });
});

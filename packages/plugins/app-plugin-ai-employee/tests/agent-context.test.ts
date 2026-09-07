import { describe, expect, it } from 'vitest';
import { defineTools, type AgentContext } from '@nocobase/ai-employee';
import {
  createTestActor,
  createTestAgentContext,
  createTestConversationExecution,
} from './app/test-context.js';

const contextTool = defineTools<AgentContext<{}, {}>>({
  scope: 'GENERAL',
  definition: { name: 'read-context', description: 'read context' },
  invoke: async (ctx) => ({ sessionId: ctx.state.sessionId }),
});

const contextFreeTool = defineTools<AgentContext<{}, {}>>({
  scope: 'GENERAL',
  requiresContext: false,
  definition: { name: 'context-free', description: 'context free' },
  invoke: async () => 'ok',
});

describe('AgentContext adapter', () => {
  it('maps actor and execution state without leaking transport fields', () => {
    const agentContext = createTestAgentContext({
      actor: createTestActor({
        id: 7,
        roles: ['admin'],
        locale: 'en-US',
      }),
      execution: createTestConversationExecution({
        sessionId: 'main',
        messageId: 'message-1',
        streamTarget: { write() {}, end() {} },
        abortSignal: new AbortController().signal,
      }),
      state: { sessionId: 'sub' },
    });

    expect(agentContext.actor).toEqual({
      id: 7,
      roles: ['admin'],
      isRoot: false,
      locale: 'en-US',
    });
    expect(agentContext.state.sessionId).toBe('sub');
    expect(agentContext.state.messageId).toBe('message-1');
    expect(agentContext.state).not.toHaveProperty('streamTarget');
    expect(agentContext.state).not.toHaveProperty('abortSignal');
    expect(Object.keys(agentContext.services.frontendTools).sort()).toEqual([
      'find',
      'readResult',
    ]);
  });
});

describe('AgentService AgentContext propagation', () => {
  it('passes request-scoped contexts independently and reports missing context clearly', async () => {
    const contextA = createTestAgentContext({ state: { sessionId: 'A' } });
    const contextB = createTestAgentContext({ state: { sessionId: 'B' } });
    const built = (await import('@nocobase/ai-employee')).buildTool(
      contextTool,
    ) as unknown as {
      invoke: (
        input: unknown,
        config: unknown,
      ) => Promise<{ content: unknown }>;
    };
    const [a, b] = await Promise.all([
      built.invoke(
        {},
        { context: { agentContext: contextA }, toolCall: { id: 'a' } },
      ),
      built.invoke(
        {},
        { context: { agentContext: contextB }, toolCall: { id: 'b' } },
      ),
    ]);
    expect(a.content).toBe('{"sessionId":"A"}');
    expect(b.content).toBe('{"sessionId":"B"}');
    await expect(
      built.invoke({}, { context: {}, toolCall: { id: 'missing' } }),
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

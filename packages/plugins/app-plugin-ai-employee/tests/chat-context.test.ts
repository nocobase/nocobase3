import { describe, expect, it } from 'vitest';
import type { LLMProvider, ToolsEntity } from '@nocobase/ai-employee';
import { FixedChatContextProvider } from '../server/agent/chat-context.js';

const provider = {
  modelOptions: { model: 'fixed-model' },
} as unknown as LLMProvider;

const tool = (name: string): ToolsEntity =>
  ({ definition: { name } }) as unknown as ToolsEntity;

describe('FixedChatContextProvider', () => {
  it('resolves a fixed provider without application dependencies', async () => {
    const context = new FixedChatContextProvider({
      provider,
      providerName: 'fixed',
      llmService: 'service',
      systemPrompt: 'Direct prompt',
      tools: [tool('one'), tool('two')],
    });

    const llm = await context.resolveLLM({});
    expect(llm).toMatchObject({
      provider,
      providerName: 'fixed',
      llmService: 'service',
      model: 'fixed-model',
    });
    expect(await context.getSystemPrompt([], {}, llm)).toBe('Direct prompt');
    expect(await context.activeTools({})).toEqual(new Set(['one', 'two']));
    expect(await context.getToolsMap({})).toEqual(
      new Map([
        ['one', expect.objectContaining({ definition: { name: 'one' } })],
        ['two', expect.objectContaining({ definition: { name: 'two' } })],
      ]),
    );
    expect(context.shouldInterruptToolCall()).toBe(false);
    expect(context.isAutoCall(undefined, undefined)).toBe(false);
    expect(await context.getToolsMap()).toEqual(
      new Map([
        ['one', expect.objectContaining({ definition: { name: 'one' } })],
        ['two', expect.objectContaining({ definition: { name: 'two' } })],
      ]),
    );
  });

  it('returns independent resolved contexts through concurrent calls', async () => {
    const context = new FixedChatContextProvider({
      provider,
      providerName: 'fixed',
    });

    const [first, second] = await Promise.all([
      context.resolveLLM({ context: { request: 1 } }),
      context.resolveLLM({ context: { request: 2 } }),
    ]);

    expect(first).not.toBe(second);
    expect(first.provider).toBe(provider);
    expect(second.provider).toBe(provider);
  });
});

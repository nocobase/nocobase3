import type { AIMessageInput, LLMProvider } from '@nocobase/ai-employee';
import { describe, expect, it, vi } from 'vitest';

import { createAIEmployeeChatContextProvider } from '../server/agent/ai-employee/providers.js';
import type { AIEmployeeAgentRuntimeOptions } from '../server/agent/ai-employee/runtime.js';

function createOptions(records: Record<string, unknown>[]) {
  const find = vi.fn(async () => records);
  const collectionRepository = vi.fn(() => ({ find }));
  const options = {
    agentContext: {
      actor: { id: 7, roles: [] },
      logger: { warn: vi.fn() },
      translate: (value: string) => value,
    },
    database: {},
    caching: {},
    fileStorage: {},
    snowflake: {},
    repositories: { collectionRepository },
    aiEmployeesManager: {},
    builtInManager: { setupBuiltInInfo: vi.fn() },
    llmStreamCachedManager: {},
    knowledgeBaseManager: {},
    workContextHandler: { resolve: vi.fn(async () => []) },
    documentLoaders: { cached: {} },
    employee: { username: 'tester' },
    sessionId: 'session-1',
  } as unknown as AIEmployeeAgentRuntimeOptions;
  return { options, find, collectionRepository };
}

function createProvider() {
  const parseAttachment = vi.fn(async () => ({
    placement: 'message',
    content: {
      type: 'image_url',
      image_url: { url: 'data:image/png;base64,x' },
    },
  }));
  const provider = {
    parseAttachment,
    prepareStoredAssistantAdditionalKwargs: (value: unknown) => value,
  } as unknown as LLMProvider;
  return { provider, parseAttachment };
}

function createMessage(): AIMessageInput {
  return {
    role: 'user',
    content: { type: 'text', content: 'inspect this' },
    attachments: [
      {
        id: 1,
        filename: 'forged.png',
        mimetype: 'application/x-forged',
        path: 'forged-path',
        disk: 'forged-disk',
        source: { collectionName: 'aiFiles' },
      },
    ],
  } as AIMessageInput;
}

describe('AI employee message attachment boundary', () => {
  it('resolves attachments once at the formatting boundary', async () => {
    const canonical = {
      id: 1,
      filename: 'real.png',
      mimetype: 'image/png',
      path: 'real-path',
      disk: 'local',
      createdById: 7,
    };
    const { options, find, collectionRepository } = createOptions([canonical]);
    const chatContext = createAIEmployeeChatContextProvider(options);
    const { provider, parseAttachment } = createProvider();

    await chatContext.formatMessages([createMessage()], { provider } as any);
    expect(collectionRepository).toHaveBeenCalledWith('aiFiles');
    expect(find).toHaveBeenCalledOnce();
    expect(find).toHaveBeenCalledWith({
      filter: { id: { $in: [1] }, createdById: 7 },
    });
    expect(parseAttachment).toHaveBeenCalledOnce();
    expect(parseAttachment).toHaveBeenCalledWith(
      { ...canonical, source: { collectionName: 'aiFiles' } },
      expect.any(Object),
    );
  });

  it('resolves attachments when formatting is called directly', async () => {
    const canonical = {
      id: 1,
      filename: 'real.png',
      mimetype: 'image/png',
      path: 'real-path',
      disk: 'local',
      createdById: 7,
    };
    const { options, find } = createOptions([canonical]);
    const chatContext = createAIEmployeeChatContextProvider(options);
    const { provider, parseAttachment } = createProvider();

    await chatContext.formatMessages([createMessage()], { provider } as any);

    expect(find).toHaveBeenCalledOnce();
    expect(parseAttachment).toHaveBeenCalledWith(
      { ...canonical, source: { collectionName: 'aiFiles' } },
      expect.any(Object),
    );
  });

  it('does not pass unresolved attachments to the provider', async () => {
    const { options, find } = createOptions([]);
    const chatContext = createAIEmployeeChatContextProvider(options);
    const { provider, parseAttachment } = createProvider();

    const formatted = await chatContext.formatMessages([createMessage()], {
      provider,
    } as any);

    expect(find).toHaveBeenCalledOnce();
    expect(parseAttachment).not.toHaveBeenCalled();
    expect(formatted).toEqual([
      expect.objectContaining({
        role: 'user',
        content: '<user_query>inspect this</user_query>',
        additional_kwargs: expect.objectContaining({ attachments: [] }),
      }),
    ]);
  });
});

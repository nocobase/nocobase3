import { describe, expect, it, vi } from 'vitest';
import type { AIMessageInput } from '@nocobase/ai-employee';
import type { AIMessageEntity } from '../../server/repository/index.js';
import { AIConversationService } from '../../server/service/ai-conversation-service.js';

const findOne = vi.fn();
const service = new AIConversationService({
  repositories: { aiMessages: { findOne } } as never,
  runtime: {} as never,
});

describe('AIConversationService tool continuation', () => {
  it('prepends the matching assistant tool call before cancelled tool outputs', async () => {
    const assistantMessage = {
      messageId: '100',
      sessionId: 'session-1',
      role: 'atlas',
      content: { type: 'text', content: '' },
      toolCalls: [
        { id: 'call-1', name: 'exampleTool', type: 'tool_call', args: {} },
      ],
      metadata: {
        response_metadata: {
          output: [
            {
              type: 'function_call',
              call_id: 'call-1',
              name: 'exampleTool',
              arguments: '{}',
            },
          ],
        },
      },
    } as AIMessageEntity;
    findOne.mockResolvedValueOnce(assistantMessage);
    const messages: AIMessageInput[] = [
      {
        role: 'user',
        content: { type: 'text', content: 'Continue' },
        metadata: {},
      } as AIMessageInput,
    ];
    const toolMessages = [
      {
        messageId: '101',
        sessionId: 'session-1',
        role: 'tool',
        content: { type: 'text', content: 'Ignored' },
        metadata: { sourceMessageId: '100', toolCallId: 'call-1' },
      } as AIMessageEntity,
    ];

    await service.prependCancelledToolContinuation({
      sessionId: 'session-1',
      messages,
      toolMessages,
    });

    expect(findOne).toHaveBeenCalledWith({
      filter: { sessionId: 'session-1', messageId: '100' },
    });
    expect(messages.map((message) => message.role)).toEqual([
      'atlas',
      'tool',
      'user',
    ]);
    expect(messages[0].toolCalls?.[0]?.id).toBe('call-1');
    expect(messages[1].metadata?.toolCallId).toBe('call-1');
  });
});

describe('AIConversationService attachments', () => {
  it('treats locally uploaded files without source metadata as aiFiles', () => {
    const messages = [
      {
        role: 'user',
        content: { type: 'text', content: 'Read this file' },
        attachments: [{ id: 'file-1', filename: 'notes.txt' }],
        metadata: {},
      } as AIMessageInput,
    ];

    service.normalizeIncomingMessageAttachments({
      ctx: { t: (message: string) => message } as any,
      messages,
    });

    expect(messages[0].attachments).toEqual([
      {
        id: 'file-1',
        filename: 'notes.txt',
        source: { collectionName: 'aiFiles' },
      },
    ]);
  });

  it('removes client-provided trustworthy flags', () => {
    const messages = [
      {
        role: 'user',
        content: { type: 'text', content: 'Read this file' },
        attachments: [
          {
            id: 'file-1',
            source: { collectionName: 'aiFiles', trustworthy: true },
          },
        ],
        metadata: {},
      } as AIMessageInput,
    ];

    service.normalizeIncomingMessageAttachments({
      ctx: { t: (message: string) => message } as any,
      messages,
    });

    expect(messages[0].attachments?.[0]).toEqual({
      id: 'file-1',
      source: { collectionName: 'aiFiles' },
    });
  });
});

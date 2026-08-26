import type { AIMessage } from './types/ai-message.type.js';

export function stripToolCallTags(content: string): string | null {
  if (typeof content !== 'string') return content;
  return content.replace(
    /<[|｜]tool▁(?:calls▁begin|calls▁end|call▁begin|call▁end|sep)[|｜]>/g,
    '',
  );
}

export function parseResponseMessage(row: AIMessage): Record<string, any> {
  const {
    content: rawContent,
    messageId,
    metadata,
    role,
    toolCalls,
    attachments,
    workContext,
    createdAt,
  } = row;
  const content: Record<string, unknown> = {
    ...(rawContent ?? {}),
    content: stripToolCallTags(rawContent?.content),
    messageId,
    metadata,
    attachments,
    workContext,
  };
  if (toolCalls) content.tool_calls = toolCalls;
  return { key: messageId, createdAt, content, role };
}

import type { AgentStreamEvent } from './types.js';

export type LegacyAgentEventPayload = {
  sessionId: string;
  from?: string;
  username?: string;
  metadata?: Record<string, unknown>;
  type: AgentStreamEvent['type'];
  body?: unknown;
};

export function toLegacyAgentEventPayload(
  event: AgentStreamEvent,
): LegacyAgentEventPayload | null {
  const base = { ...event.conversation, type: event.type };
  switch (event.type) {
    case 'content':
      return { ...base, body: event.content };
    case 'reasoning':
      return {
        ...base,
        body: {
          status:
            event.action === 'stop'
              ? 'stop'
              : event.action === 'start'
                ? 'start'
                : 'content',
          content: event.content ?? '',
        },
      };
    case 'web_search':
      return { ...base, body: event.body };
    case 'tool_call_chunks':
      return { ...base, body: event.chunks };
    case 'tool_calls':
      return { ...base, body: { toolCalls: event.toolCalls } };
    case 'tool_call_status':
      return { ...base, body: event.status };
    case 'interrupt_requested':
    case 'interrupt_resolved':
    case 'message_persisted':
    case 'sub_agent_started':
      return null;
    default:
      return base;
  }
}

export function stringifyAgentEventPayload(
  payload: LegacyAgentEventPayload,
): string {
  return JSON.stringify(payload, (_key, value) =>
    typeof value === 'bigint' ? value.toString() : value,
  );
}

export function encodeAgentEventSSE(event: AgentStreamEvent): string {
  const payload = toLegacyAgentEventPayload(event);
  return payload ? `data: ${stringifyAgentEventPayload(payload)}\n\n` : '';
}

export class AgentSSEAdapter {
  constructor(
    private readonly write: (chunk: string) => void | Promise<void>,
    private readonly append?: (chunk: string) => void | Promise<void>,
  ) {}

  async send(event: AgentStreamEvent): Promise<string> {
    const chunk = encodeAgentEventSSE(event);
    if (!chunk) return chunk;
    await this.append?.(chunk);
    await this.write(chunk);
    return chunk;
  }

  async consume(events: AsyncIterable<AgentStreamEvent>): Promise<void> {
    for await (const event of events) await this.send(event);
  }
}

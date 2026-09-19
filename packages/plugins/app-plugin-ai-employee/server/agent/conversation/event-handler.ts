import type { Logger } from '@nocobase/logging';
import type { AgentEventHandler, AgentExecutionMode } from '../types.js';
import type { AIConversationRepository } from '../../repository/ai-conversation.js';

export class ConversationEventHandler implements AgentEventHandler {
  public constructor(
    private readonly conversations: AIConversationRepository,
    private readonly sessionId: string,
    private readonly logger?: Logger,
  ) {}

  public async beforeExecution(mode: AgentExecutionMode): Promise<void> {
    await this.conversations.update({
      values: { llmActiveState: mode },
      filter: { sessionId: this.sessionId },
    });
  }

  public async afterExecution(
    mode: AgentExecutionMode,
    result?: { aborted?: boolean },
  ): Promise<void> {
    await this.conversations.update({
      values: {
        llmActiveState: 'idle',
        ...(mode === 'streaming'
          ? { read: result?.aborted ? true : false }
          : {}),
      },
      filter: { sessionId: this.sessionId },
    });
    this.logger?.debug?.(
      { sessionId: this.sessionId, mode },
      'Conversation execution completed',
    );
  }
}

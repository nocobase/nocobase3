import type { BaseCheckpointSaver } from '@langchain/langgraph-checkpoint';

import type {
  AIConversationRepository,
  AIMessageRepository,
} from '@nocobase/ai-employee';

export type AIConversationsType = {
  sessionId: string;
  thread: number;
};

export class CheckpointCleaner {
  constructor(
    private readonly conversations: AIConversationRepository,
    private readonly messages: AIMessageRepository,
    private readonly checkpointSaver: BaseCheckpointSaver,
  ) {}

  async cleanOutdated(expiredAt: Date): Promise<void> {
    const conversations = await this.conversations.find({
      filter: {
        updatedAt: { $lt: expiredAt },
        thread: { $ne: 0 },
      },
    });
    const targets: AIConversationsType[] = [];
    for (const conversation of conversations) {
      const message = await this.messages.findOne({
        filter: { sessionId: conversation.sessionId },
        sort: ['-messageId'],
      });
      if (!message) continue;
      const updatedAt = message.updatedAt
        ? new Date(message.updatedAt)
        : undefined;
      const hasToolCalls = Array.isArray(message.toolCalls)
        ? message.toolCalls.length > 0
        : Boolean(message.toolCalls);
      if (updatedAt && updatedAt < expiredAt && !hasToolCalls) {
        targets.push({
          sessionId: conversation.sessionId,
          thread: conversation.thread ?? 0,
        });
      }
    }
    await this.clean(targets);
  }

  async clean(conversations: AIConversationsType[]): Promise<void> {
    if (!conversations.length) return;
    await this.conversations.update({
      values: { thread: 0 },
      filter: {
        sessionId: {
          $in: conversations.map((conversation) => conversation.sessionId),
        },
      },
    });
    for (const threadId of this.getThreadIds(conversations)) {
      await this.checkpointSaver.deleteThread(threadId);
    }
  }

  private getThreadIds(conversations: AIConversationsType[]): string[] {
    return conversations.flatMap((conversation) =>
      Array.from(
        { length: Math.max(0, conversation.thread) },
        (_value, index) =>
          `${conversation.sessionId}:${conversation.thread - index}`,
      ),
    );
  }
}

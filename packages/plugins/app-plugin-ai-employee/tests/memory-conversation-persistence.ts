import type {
  AIChatConversation,
  AIConversation,
  AIMessage,
  AIMessageInput,
  AIToolMessage,
  ToolsEntity,
} from '@nocobase/ai-employee';
import type { ConversationPersistence } from '../server/agent/contracts/persistence.js';
import type {
  AIConversationRepository,
  AIMessageRepository,
  AIToolMessageRepository,
  AIUsageEventRepository,
} from '../server/repository/index.js';

export interface MemoryTransaction {
  readonly id: string;
}

export interface MemoryUsageEventWrite {
  readonly messageId: string;
  readonly metadata: Record<string, unknown>;
}

type MemoryRecord = Record<string, unknown>;
type MemoryFilter = Record<string, unknown>;

const isRecord = (value: unknown): value is MemoryRecord =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const valueMatches = (value: unknown, expected: unknown): boolean => {
  if (isRecord(expected)) {
    if ('$in' in expected && Array.isArray(expected.$in))
      return expected.$in.includes(value);
    if ('$gte' in expected) return String(value) >= String(expected.$gte);
    if ('$lt' in expected) return String(value) < String(expected.$lt);
    if ('$ne' in expected) return value !== expected.$ne;
  }
  return value === expected;
};

const matches = (record: MemoryRecord, filter: MemoryFilter = {}): boolean =>
  Object.entries(filter).every(([key, expected]) =>
    valueMatches(record[key], expected),
  );

const cloneRecord = <T extends MemoryRecord>(record: T): T =>
  ({ ...record }) as T;

export class MemoryConversationPersistence implements ConversationPersistence {
  public readonly conversations: AIConversationRepository;
  public readonly messages: AIMessageRepository;
  public readonly toolMessages: AIToolMessageRepository;
  public readonly usageEvents: AIUsageEventRepository;
  public readonly transactions: MemoryTransaction[] = [];
  public readonly usageEventWrites: MemoryUsageEventWrite[] = [];

  private readonly conversationRows: MemoryRecord[];
  private readonly messageRows: MemoryRecord[] = [];
  private readonly toolMessageRows: MemoryRecord[] = [];
  private nextMessageId = 1;
  private nextToolMessageId = 1;

  public constructor(sessionId = 'memory-session') {
    this.conversationRows = [{ sessionId, thread: 0 }];
    this.conversations = this.createConversationsRepository();
    this.messages = this.createMessagesRepository();
    this.toolMessages = this.createToolMessagesRepository();
    this.usageEvents = this.createUsageEventsRepository();
  }

  public createChatConversation(options: {
    sessionId: string;
  }): AIChatConversation {
    if (
      !this.conversationRows.some(
        (conversation) => conversation.sessionId === options.sessionId,
      )
    ) {
      this.conversationRows.push({ sessionId: options.sessionId, thread: 0 });
    }

    const persistence = this;
    const conversation: AIChatConversation = {
      async withTransaction<T>(
        runnable: (
          instance: AIChatConversation,
          transaction: MemoryTransaction,
        ) => Promise<T>,
        transaction?: MemoryTransaction,
      ): Promise<T> {
        const currentTransaction = transaction ?? {
          id: `transaction-${persistence.transactions.length + 1}`,
        };
        if (!transaction) persistence.transactions.push(currentTransaction);
        return runnable(conversation, currentTransaction);
      },
      getSessionId: () => options.sessionId,
      currentThread: async () => {
        const row = persistence.conversationRows.find(
          (item) => item.sessionId === options.sessionId,
        );
        if (!row) throw new Error('Conversation not existed');
        const thread = typeof row.thread === 'number' ? row.thread : 0;
        return {
          sessionId: options.sessionId,
          thread,
          threadId: `${options.sessionId}:${thread}`,
        };
      },
      updateThread: async (thread: number) => {
        const row = persistence.conversationRows.find(
          (item) => item.sessionId === options.sessionId,
        );
        if (row) row.thread = thread;
      },
      addMessages: async (
        input: AIMessageInput | AIMessageInput[],
      ): Promise<AIMessage | AIMessage[]> => {
        const values = (Array.isArray(input) ? input : [input]).map(
          (message) => {
            const saved = {
              ...message,
              sessionId: options.sessionId,
              messageId: String(persistence.nextMessageId++),
            } as AIMessage;
            persistence.messageRows.push(saved as unknown as MemoryRecord);
            const metadata = isRecord(saved.metadata) ? saved.metadata : {};
            if (saved.role === 'assistant') {
              persistence.usageEventWrites.push({
                messageId: String(saved.messageId),
                metadata,
              });
            }
            return saved;
          },
        );
        return Array.isArray(input) ? values : values[0];
      },
      removeMessages: async (query: { messageId?: string }) => {
        const retained = persistence.messageRows.filter((message) => {
          if (message.sessionId !== options.sessionId) return true;
          if (!query.messageId) return false;
          return String(message.messageId) < query.messageId;
        });
        persistence.messageRows.splice(
          0,
          persistence.messageRows.length,
          ...retained,
        );
      },
      getMessage: async (messageId: string) => {
        const message = persistence.messageRows.find(
          (item) =>
            item.sessionId === options.sessionId &&
            String(item.messageId) === messageId,
        );
        return message ? (cloneRecord(message) as unknown as AIMessage) : null;
      },
      listMessages: async (query: { messageId?: string }) => {
        return persistence.messageRows
          .filter(
            (message) =>
              message.sessionId === options.sessionId &&
              (!query.messageId || String(message.messageId) < query.messageId),
          )
          .sort((left, right) =>
            String(left.messageId).localeCompare(String(right.messageId)),
          )
          .map((message) => cloneRecord(message) as unknown as AIMessage);
      },
    } as unknown as AIChatConversation;
    return conversation;
  }

  public messagesFor(sessionId: string): AIMessage[] {
    return this.messageRows
      .filter((message) => message.sessionId === sessionId)
      .map((message) => cloneRecord(message) as unknown as AIMessage);
  }

  public toolMessagesFor(sessionId: string): AIToolMessage[] {
    return this.toolMessageRows
      .filter((message) => message.sessionId === sessionId)
      .map((message) => cloneRecord(message) as unknown as AIToolMessage);
  }

  private createConversationsRepository(): AIConversationRepository {
    const persistence = this;
    return {
      findOne: async (query: { filter?: MemoryFilter }) => {
        const row = persistence.conversationRows.find((item) =>
          matches(item, query.filter),
        );
        return row ? (cloneRecord(row) as unknown as AIConversation) : null;
      },
      update: async (query: {
        filter?: MemoryFilter;
        values: MemoryRecord;
      }) => {
        let count = 0;
        for (const row of persistence.conversationRows) {
          if (!matches(row, query.filter)) continue;
          Object.assign(row, query.values);
          count++;
        }
        return count;
      },
    } as unknown as AIConversationRepository;
  }

  private createMessagesRepository(): AIMessageRepository {
    const persistence = this;
    return {
      find: async (query: { filter?: MemoryFilter }) =>
        persistence.messageRows
          .filter((message) => matches(message, query.filter))
          .map((message) => cloneRecord(message) as unknown as AIMessage),
      findOne: async (query: { filter?: MemoryFilter }) => {
        const message = persistence.messageRows.find((item) =>
          matches(item, query.filter),
        );
        return message ? (cloneRecord(message) as unknown as AIMessage) : null;
      },
      create: async (query: { values: MemoryRecord | MemoryRecord[] }) => {
        const values = Array.isArray(query.values)
          ? query.values
          : [query.values];
        const created = values.map((value) => {
          const message = {
            ...value,
            messageId: value.messageId ?? String(persistence.nextMessageId++),
          };
          persistence.messageRows.push(message);
          return message;
        });
        return Array.isArray(query.values) ? created : created[0];
      },
      update: async (query: {
        filter?: MemoryFilter;
        values: MemoryRecord;
      }) => {
        let count = 0;
        for (const message of persistence.messageRows) {
          if (!matches(message, query.filter)) continue;
          Object.assign(message, query.values);
          count++;
        }
        return count;
      },
      destroy: async (query: { filter?: MemoryFilter }) => {
        const retained = persistence.messageRows.filter(
          (message) => !matches(message, query.filter),
        );
        const count = persistence.messageRows.length - retained.length;
        persistence.messageRows.splice(
          0,
          persistence.messageRows.length,
          ...retained,
        );
        return count;
      },
    } as unknown as AIMessageRepository;
  }

  private createToolMessagesRepository(): AIToolMessageRepository {
    const persistence = this;
    return {
      find: async (query: { filter?: MemoryFilter }) =>
        persistence.toolMessageRows
          .filter((message) => matches(message, query.filter))
          .map((message) => cloneRecord(message) as unknown as AIToolMessage),
      findOne: async (query: { filter?: MemoryFilter }) => {
        const message = persistence.toolMessageRows.find((item) =>
          matches(item, query.filter),
        );
        return message
          ? (cloneRecord(message) as unknown as AIToolMessage)
          : null;
      },
      create: async (query: { values: MemoryRecord | MemoryRecord[] }) => {
        const values = Array.isArray(query.values)
          ? query.values
          : [query.values];
        const created = values.map((value) => {
          const message = {
            ...value,
            id: value.id ?? String(persistence.nextToolMessageId++),
          };
          persistence.toolMessageRows.push(message);
          return message;
        });
        return Array.isArray(query.values) ? created : created[0];
      },
      update: async (query: {
        filter?: MemoryFilter;
        values: MemoryRecord;
      }) => {
        let count = 0;
        for (const message of persistence.toolMessageRows) {
          if (!matches(message, query.filter)) continue;
          Object.assign(message, query.values);
          count++;
        }
        return count;
      },
    } as unknown as AIToolMessageRepository;
  }

  private createUsageEventsRepository(): AIUsageEventRepository {
    return {
      upsert: async () => undefined,
    } as unknown as AIUsageEventRepository;
  }
}

export const emptyToolMap = (): ReadonlyMap<string, ToolsEntity> => new Map();

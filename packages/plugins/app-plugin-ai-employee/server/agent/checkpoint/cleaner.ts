import type { DatabaseConnection } from '@nocobase/db';

import type {
  AIConversationEntity,
  AIConversationRepository,
  AIMessageRepository,
  LCCheckpointBlobRepository,
  LCCheckpointRepository,
  LCCheckpointWriteRepository,
} from '../../repository/index.js';

/**
 * The thread of a conversation whose checkpoints were released. A conversation
 * starts at thread 1, so nothing is checkpointed under thread 0 in the normal
 * course; the next run of a released conversation replays its history from the
 * database onto a fresh thread instead.
 */
export const RELEASED_THREAD = 0;

/** Conversations examined, and released, per transaction. */
export const DEFAULT_CHECKPOINT_CLEANUP_BATCH_SIZE = 100;

/**
 * The most values one `IN` list carries. Oracle accepts at most 1000 values in
 * a list and SQL Server 2100 parameters in a statement, so every dialect takes
 * a list of this length.
 */
const IN_LIST_LIMIT = 500;

export interface CheckpointCleanerRepositories {
  readonly conversations: AIConversationRepository;
  readonly messages: AIMessageRepository;
  readonly checkpoints: LCCheckpointRepository;
  readonly blobs: LCCheckpointBlobRepository;
  readonly writes: LCCheckpointWriteRepository;
}

export interface CleanOutdatedOptions {
  readonly batchSize?: number;
  /** Stops between batches; a batch that has begun completes. */
  readonly signal?: AbortSignal;
}

type ReleaseTarget = {
  readonly sessionId: string;
  readonly thread: number;
};

function hasToolCalls(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.length > 0 : Boolean(parsed);
    } catch {
      return value.length > 0;
    }
  }
  return Boolean(value);
}

function chunk<T>(values: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size)
    chunks.push(values.slice(index, index + size));
  return chunks;
}

/**
 * Releases the checkpoints of conversations nobody has used since a point in
 * time. A released conversation keeps every message: its thread is set to
 * {@link RELEASED_THREAD}, and the agent rebuilds its context from the stored
 * messages the next time it runs.
 */
export class CheckpointCleaner {
  public constructor(
    private readonly database: DatabaseConnection,
    private readonly repositories: CheckpointCleanerRepositories,
  ) {}

  /**
   * Releases every conversation last updated before `expiredAt` whose latest
   * message is older too and asks for no tool call. Such a call may be waiting
   * for a decision, and only its checkpoint can resume it. Returns how many
   * conversations were released.
   */
  public async cleanOutdated(
    expiredAt: Date,
    options: CleanOutdatedOptions = {},
  ): Promise<number> {
    const batchSize = Math.max(
      1,
      Math.floor(options.batchSize ?? DEFAULT_CHECKPOINT_CLEANUP_BATCH_SIZE),
    );
    let released = 0;
    // A conversation passed over stays a candidate, so the scan moves on by
    // session id rather than by asking again for the oldest candidates.
    let after: string | undefined;
    while (!options.signal?.aborted) {
      const conversations = await this.repositories.conversations.find({
        filter: {
          updatedAt: { $lt: expiredAt },
          thread: { $ne: RELEASED_THREAD },
          ...(after === undefined ? {} : { sessionId: { $gt: after } }),
        },
        sort: ['sessionId'],
        limit: batchSize,
      });
      const last = conversations.at(-1);
      if (!last?.sessionId) break;
      after = last.sessionId;
      const targets: ReleaseTarget[] = [];
      for (const conversation of conversations) {
        if (await this.isIdle(conversation, expiredAt)) {
          targets.push({
            sessionId: conversation.sessionId!,
            thread: Number(conversation.thread),
          });
        }
      }
      released += await this.release(targets, expiredAt);
      if (conversations.length < batchSize) break;
    }
    return released;
  }

  private async isIdle(
    conversation: AIConversationEntity,
    expiredAt: Date,
  ): Promise<boolean> {
    if (!conversation.sessionId) return false;
    const message = await this.repositories.messages.findOne({
      filter: { sessionId: conversation.sessionId },
      sort: ['-messageId'],
    });
    if (!message?.updatedAt) return false;
    return (
      new Date(message.updatedAt) < expiredAt &&
      !hasToolCalls(message.toolCalls)
    );
  }

  /**
   * Moves each conversation to the released thread and deletes the checkpoints
   * of every thread it has had, in one transaction. The move only succeeds
   * while the conversation is still unused, and a run starting meanwhile
   * updates the conversation first, so a conversation is released either
   * before that run reads its thread or not at all.
   */
  private async release(
    targets: readonly ReleaseTarget[],
    expiredAt: Date,
  ): Promise<number> {
    if (!targets.length) return 0;
    const { conversations, checkpoints, blobs, writes } = this.repositories;
    return this.database.transaction(async (connection) => {
      const threadIds: string[] = [];
      let released = 0;
      for (const target of targets) {
        const updated = await conversations.update(
          {
            values: { thread: RELEASED_THREAD },
            filter: {
              sessionId: target.sessionId,
              thread: target.thread,
              updatedAt: { $lt: expiredAt },
            },
          },
          { connection },
        );
        if (!updated) continue;
        released += 1;
        // Thread 0 included: a conversation its caller created on thread 0 has
        // checkpoints there from before its first fork, and a released
        // conversation must hold none.
        for (let thread = RELEASED_THREAD; thread <= target.thread; thread++)
          threadIds.push(`${target.sessionId}:${thread}`);
      }
      for (const ids of chunk(threadIds, IN_LIST_LIMIT)) {
        const filter = { threadId: { $in: ids } };
        await writes.destroy({ filter }, { connection });
        await blobs.destroy({ filter }, { connection });
        await checkpoints.destroy({ filter }, { connection });
      }
      return released;
    });
  }
}

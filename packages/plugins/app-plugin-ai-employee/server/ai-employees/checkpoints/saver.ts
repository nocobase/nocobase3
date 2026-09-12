import type { RunnableConfig } from '@langchain/core/runnables';
import {
  BaseCheckpointSaver,
  type ChannelVersions,
  type Checkpoint,
  type CheckpointListOptions,
  type CheckpointMetadata,
  type CheckpointTuple,
  maxChannelVersion,
  type PendingWrite,
  type SerializerProtocol,
  TASKS,
  WRITES_IDX_MAP,
} from '@langchain/langgraph-checkpoint';

import type {
  LCCheckpointBlobEntity,
  LCCheckpointBlobRepository,
  LCCheckpointEntity,
  LCCheckpointRepository,
  LCCheckpointWriteEntity,
  LCCheckpointWriteRepository,
} from '../../repository/index.js';

export interface CheckpointRepositories {
  checkpoints: LCCheckpointRepository;
  blobs: LCCheckpointBlobRepository;
  writes: LCCheckpointWriteRepository;
}

function bytes(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (Buffer.isBuffer(value)) return new Uint8Array(value);
  if (typeof value === 'string')
    return new Uint8Array(Buffer.from(value, 'base64'));
  return new Uint8Array();
}

function storedBytes(
  value: Uint8Array | null | undefined,
): Uint8Array | undefined {
  return value ? new Uint8Array(value) : undefined;
}

function plain<T>(record: T): T {
  return record;
}

export class NativeCollectionSaver extends BaseCheckpointSaver {
  constructor(
    private readonly repositories: CheckpointRepositories,
    serde?: SerializerProtocol,
  ) {
    super(serde);
  }

  async getTuple(config: RunnableConfig): Promise<CheckpointTuple | undefined> {
    const {
      thread_id,
      checkpoint_ns = '',
      checkpoint_id,
    } = config.configurable ?? {};
    if (!thread_id) return undefined;
    const row = await this.repositories.checkpoints.findOne({
      filter: {
        threadId: thread_id,
        checkpointNs: checkpoint_ns,
        ...(checkpoint_id ? { checkpointId: checkpoint_id } : {}),
      },
      sort: checkpoint_id ? undefined : ['-checkpointId'],
    });
    return row ? this.toTuple(plain(row)) : undefined;
  }

  async *list(
    config: RunnableConfig,
    options?: CheckpointListOptions,
  ): AsyncGenerator<CheckpointTuple> {
    const filter: Record<string, unknown> = {};
    const configurable = config.configurable ?? {};
    if (configurable.thread_id) filter.threadId = configurable.thread_id;
    if (configurable.checkpoint_ns != null)
      filter.checkpointNs = configurable.checkpoint_ns;
    if (configurable.checkpoint_id)
      filter.checkpointId = configurable.checkpoint_id;
    if (options?.before?.configurable?.checkpoint_id) {
      filter.checkpointId = { $lt: options.before.configurable.checkpoint_id };
    }
    const rows = await this.repositories.checkpoints.find({
      filter,
      sort: ['-checkpointId'],
    });
    let count = 0;
    for (const record of rows) {
      const row = plain<LCCheckpointEntity>(record);
      if (
        options?.filter &&
        !Object.entries(options.filter).every(([key, value]) =>
          Object.is(row.metadata?.[key], value),
        )
      ) {
        continue;
      }
      yield await this.toTuple(row);
      count += 1;
      if (options?.limit != null && count >= Number(options.limit)) return;
    }
  }

  async put(
    config: RunnableConfig,
    checkpoint: Checkpoint,
    metadata: CheckpointMetadata,
    newVersions: ChannelVersions,
  ): Promise<RunnableConfig> {
    if (!config.configurable) throw new Error('Missing configurable field');
    const {
      thread_id,
      checkpoint_ns = '',
      checkpoint_id,
    } = config.configurable;
    if (!thread_id) throw new Error('configurable.thread_id is required');

    for (const [channel, version] of Object.entries(newVersions)) {
      const existing = await this.repositories.blobs.findOne({
        filter: {
          threadId: thread_id,
          checkpointNs: checkpoint_ns,
          channel,
          version: String(version),
        },
      });
      if (existing) continue;
      const [type, value] =
        channel in checkpoint.channel_values
          ? await this.serde.dumpsTyped(checkpoint.channel_values[channel])
          : ['empty', null];
      await this.repositories.blobs.create({
        values: {
          threadId: thread_id,
          checkpointNs: checkpoint_ns,
          channel,
          version: String(version),
          type,
          blob: value ? storedBytes(new Uint8Array(value)) : undefined,
        },
      });
    }

    const storedCheckpoint = { ...checkpoint } as Record<string, unknown>;
    delete storedCheckpoint.channel_values;
    const values: LCCheckpointEntity = {
      threadId: thread_id,
      checkpointNs: checkpoint_ns,
      checkpointId: checkpoint.id,
      parentCheckpointId: checkpoint_id,
      checkpoint: storedCheckpoint,
      metadata: await this.dumpMetadata(metadata),
    };
    const existing = await this.repositories.checkpoints.findOne({
      filter: {
        threadId: thread_id,
        checkpointNs: checkpoint_ns,
        checkpointId: checkpoint.id,
      },
    });
    if (existing) {
      await this.repositories.checkpoints.update({
        filter: {
          threadId: thread_id,
          checkpointNs: checkpoint_ns,
          checkpointId: checkpoint.id,
        },
        values,
      });
    } else {
      await this.repositories.checkpoints.create({ values });
    }
    return {
      configurable: {
        thread_id,
        checkpoint_ns,
        checkpoint_id: checkpoint.id,
      },
    };
  }

  async putWrites(
    config: RunnableConfig,
    writes: PendingWrite[],
    taskId: string,
  ): Promise<void> {
    const threadId = config.configurable?.thread_id;
    const checkpointId = config.configurable?.checkpoint_id;
    const checkpointNs = config.configurable?.checkpoint_ns ?? '';
    if (!threadId || !checkpointId) {
      throw new Error('thread_id and checkpoint_id are required');
    }
    for (const [channel, value] of writes) {
      const index =
        WRITES_IDX_MAP[channel] ??
        writes.findIndex((write) => write[0] === channel);
      const [type, serialized] = await this.serde.dumpsTyped(value);
      const identity = {
        threadId,
        checkpointNs,
        checkpointId,
        taskId,
        idx: index,
      };
      const values: LCCheckpointWriteEntity = {
        ...identity,
        channel,
        type,
        blob: storedBytes(new Uint8Array(serialized))!,
      };
      const existing = await this.repositories.writes.findOne({
        filter: identity,
      });
      if (existing) {
        await this.repositories.writes.update({ filter: identity, values });
      } else {
        await this.repositories.writes.create({ values });
      }
    }
  }

  async deleteThread(threadId: string): Promise<void> {
    await Promise.all([
      this.repositories.checkpoints.destroy({ filter: { threadId } }),
      this.repositories.blobs.destroy({ filter: { threadId } }),
      this.repositories.writes.destroy({ filter: { threadId } }),
    ]);
  }

  private async toTuple(row: LCCheckpointEntity): Promise<CheckpointTuple> {
    const checkpoint = row.checkpoint as Omit<
      Checkpoint,
      'pending_sends' | 'channel_values'
    >;
    const blobRows = await this.repositories.blobs.find({
      filter: { threadId: row.threadId, checkpointNs: row.checkpointNs },
    });
    const blobsByKey = new Map(
      blobRows.map((record) => {
        const blob = plain<LCCheckpointBlobEntity>(record);
        return [`${blob.channel}:${blob.version}`, blob];
      }),
    );
    const channelValues: Record<string, unknown> = {};
    for (const [channel, version] of Object.entries(
      checkpoint.channel_versions ?? {},
    )) {
      const blob = blobsByKey.get(`${channel}:${version}`);
      if (!blob || blob.type === 'empty') continue;
      channelValues[channel] = await this.serde.loadsTyped(
        blob.type,
        bytes(blob.blob),
      );
    }

    if (checkpoint.v < 4 && row.parentCheckpointId) {
      const sends = await this.repositories.writes.find({
        filter: {
          threadId: row.threadId,
          checkpointId: row.parentCheckpointId,
          channel: TASKS,
        },
        sort: ['taskId', 'idx'],
      });
      if (sends.length) {
        const pendingSends = await Promise.all(
          sends.map((record) => {
            const write = plain<LCCheckpointWriteEntity>(record);
            return this.serde.loadsTyped(write.type!, bytes(write.blob));
          }),
        );
        channelValues[TASKS] = pendingSends;
        checkpoint.channel_versions[TASKS] = Object.keys(
          checkpoint.channel_versions,
        ).length
          ? maxChannelVersion(...Object.values(checkpoint.channel_versions))
          : this.getNextVersion(undefined);
      }
    }

    const writeRows = await this.repositories.writes.find({
      filter: {
        threadId: row.threadId,
        checkpointNs: row.checkpointNs,
        checkpointId: row.checkpointId,
      },
      sort: ['taskId', 'idx'],
    });
    const pendingWrites = await Promise.all(
      writeRows.map(async (record) => {
        const write = plain<LCCheckpointWriteEntity>(record);
        return [
          write.taskId,
          write.channel,
          await this.serde.loadsTyped(write.type!, bytes(write.blob)),
        ] as [string, string, unknown];
      }),
    );

    return {
      config: {
        configurable: {
          thread_id: row.threadId,
          checkpoint_ns: row.checkpointNs,
          checkpoint_id: row.checkpointId,
        },
      },
      checkpoint: { ...checkpoint, channel_values: channelValues },
      metadata: await this.loadMetadata(row.metadata ?? {}),
      parentConfig: row.parentCheckpointId
        ? {
            configurable: {
              thread_id: row.threadId,
              checkpoint_ns: row.checkpointNs,
              checkpoint_id: row.parentCheckpointId,
            },
          }
        : undefined,
      pendingWrites,
    };
  }

  private async dumpMetadata(
    metadata: CheckpointMetadata,
  ): Promise<Record<string, unknown>> {
    const [, value] = await this.serde.dumpsTyped(metadata);
    return JSON.parse(new TextDecoder().decode(value).replaceAll('\0', ''));
  }

  private async loadMetadata(
    metadata: Record<string, unknown>,
  ): Promise<CheckpointMetadata> {
    const [type, value] = await this.serde.dumpsTyped(metadata);
    return this.serde.loadsTyped(type, value) as Promise<CheckpointMetadata>;
  }
}

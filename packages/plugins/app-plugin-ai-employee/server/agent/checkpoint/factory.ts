import { MemorySaver, type BaseCheckpointSaver } from '@langchain/langgraph';

import type { RepositoryFactory } from '../../factory/repository-factory.js';
import { NativeCollectionSaver } from './saver.js';

/** Builds the checkpoint savers an agent can pause and resume through. */
export class CheckpointSaverFactory {
  public constructor(private readonly repositories: RepositoryFactory) {}

  /** Checkpoints in the plugin's own tables, so any later service can resume. */
  public getDatabaseCheckpointSaver(): BaseCheckpointSaver {
    return new NativeCollectionSaver({
      checkpoints: this.repositories.lcCheckpoints,
      blobs: this.repositories.lcCheckpointBlobs,
      writes: this.repositories.lcCheckpointWrites,
    });
  }

  /** Checkpoints in this process, so only the same service can resume. */
  public getMemorySaver(): BaseCheckpointSaver {
    return new MemorySaver();
  }
}

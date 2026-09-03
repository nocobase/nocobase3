import type { CollectionDefinition } from '../../collection/types.js';
import type {
  CreateManyResult,
  DeleteManyResult,
  DeleteOneResult,
  RepositoryRecord,
  SingleMutationResult,
  UpdateManyResult,
} from '../types.js';

export interface RepositoryLogicalPlan {
  readonly collection: CollectionDefinition;
}

export interface RepositoryReadPlan extends RepositoryLogicalPlan {
  readonly operation: 'findMany' | 'findOne' | 'count' | 'exists';
  readonly input: Readonly<Record<string, unknown>>;
}

export interface RepositoryMutationPlan extends RepositoryLogicalPlan {
  readonly operation:
    | 'createOne'
    | 'createMany'
    | 'updateOne'
    | 'updateMany'
    | 'deleteOne'
    | 'deleteMany';
  readonly input: Readonly<Record<string, unknown>>;
}

export type RepositoryExecutionResult =
  | RepositoryRecord[]
  | RepositoryRecord
  | undefined
  | number
  | boolean
  | SingleMutationResult<RepositoryRecord>
  | CreateManyResult
  | UpdateManyResult
  | DeleteOneResult
  | DeleteManyResult;

/** Internal adapter boundary. Plans contain logical Collection and Field names only. */
export interface RepositoryExecutionAdapter {
  executeRead(plan: RepositoryReadPlan): Promise<RepositoryExecutionResult>;
  executeMutation(
    plan: RepositoryMutationPlan,
  ): Promise<RepositoryExecutionResult>;
}

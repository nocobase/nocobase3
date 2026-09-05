import type { CollectionDefinition } from '../../collection/types.js';
import type {
  FilterAst,
  CreatedTargetReference,
  RelationMutationAst,
  RepositoryRecord,
  SelectAst,
  SortAst,
} from '../types.js';

export interface RepositoryReadPlan {
  readonly collection: CollectionDefinition;
  readonly fields: readonly string[];
  readonly select?: SelectAst;
  readonly filter?: FilterAst;
  readonly sort?: SortAst;
  readonly limit?: number;
  readonly offset?: number;
}

export interface RepositoryFilterPlan {
  readonly collection: CollectionDefinition;
  readonly filter?: FilterAst;
}

export interface RepositoryCreateOnePlan {
  readonly collection: CollectionDefinition;
  readonly fields: readonly string[];
  readonly values: RepositoryRecord;
  readonly relations?: RelationMutationAst;
  readonly select?: SelectAst;
}

export interface RepositoryCreateManyPlan {
  readonly collection: CollectionDefinition;
  readonly records: readonly RepositoryRecord[];
}

export interface RepositoryUpdateOnePlan {
  readonly collection: CollectionDefinition;
  readonly fields: readonly string[];
  readonly filter: FilterAst;
  readonly values: RepositoryRecord;
  readonly ifVersion?: string | number;
  readonly relations?: RelationMutationAst;
  readonly select?: SelectAst;
}

export interface RepositoryUpdateManyPlan {
  readonly collection: CollectionDefinition;
  readonly filter?: FilterAst;
  readonly all: boolean;
  readonly values: RepositoryRecord;
}

export interface RepositoryDeleteOnePlan {
  readonly collection: CollectionDefinition;
  readonly filter: FilterAst;
  readonly ifVersion?: string | number;
}

export interface RepositoryDeleteManyPlan {
  readonly collection: CollectionDefinition;
  readonly filter?: FilterAst;
  readonly all: boolean;
}

export interface RepositoryExecutedMutation {
  readonly record: RepositoryRecord;
  readonly createdTargets: readonly CreatedTargetReference[];
  readonly version?: string | number;
}

export type RepositorySingleMutationMiss = 'missing' | 'multiple' | 'conflict';

/** Internal adapter boundary. Plans contain logical Collection and Field names only. */
export interface RepositoryExecutionAdapter {
  findMany(plan: RepositoryReadPlan): Promise<RepositoryRecord[]>;
  findOne(plan: RepositoryReadPlan): Promise<RepositoryRecord | undefined>;
  count(plan: RepositoryFilterPlan): Promise<number>;
  exists(plan: RepositoryFilterPlan): Promise<boolean>;
  createOne(plan: RepositoryCreateOnePlan): Promise<RepositoryExecutedMutation>;
  createMany(plan: RepositoryCreateManyPlan): Promise<number>;
  updateOne(
    plan: RepositoryUpdateOnePlan,
  ): Promise<RepositoryExecutedMutation | RepositorySingleMutationMiss>;
  updateMany(plan: RepositoryUpdateManyPlan): Promise<number>;
  deleteOne(
    plan: RepositoryDeleteOnePlan,
  ): Promise<'deleted' | RepositorySingleMutationMiss>;
  deleteMany(plan: RepositoryDeleteManyPlan): Promise<number>;
}

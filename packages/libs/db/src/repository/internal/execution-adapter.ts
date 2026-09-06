import type { CollectionDefinition } from '../../collection/types.js';
import type {
  AggregateAst,
  FilterAst,
  CreatedTargetReference,
  RelationMutationAst,
  RepositoryRecord,
  SelectAst,
  SortAst,
  UniqueSelector,
} from '../types.js';

export interface RepositoryAggregatePlan {
  readonly collection: CollectionDefinition;
  readonly aggregate: AggregateAst;
  readonly filter?: FilterAst;
}

export interface RepositoryGroupByPlan extends RepositoryAggregatePlan {
  readonly by: readonly string[];
  readonly having?: FilterAst;
  readonly sort?: SortAst;
}

export interface RepositoryReadPlan {
  readonly collection: CollectionDefinition;
  readonly fields: readonly string[];
  readonly select?: SelectAst;
  readonly filter?: FilterAst;
  readonly sort?: SortAst;
  readonly distinct?: readonly string[];
  readonly cursor?: readonly RepositoryCursorAxis[];
  readonly direction?: 'forward' | 'backward';
  readonly limit?: number;
  readonly offset?: number;
}

export interface RepositoryCursorAxis {
  readonly field: string;
  readonly direction: 'asc' | 'desc';
  readonly value: unknown;
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
  readonly fields?: readonly string[];
  readonly select?: SelectAst;
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

export interface RepositoryUpsertOnePlan {
  readonly collection: CollectionDefinition;
  readonly fields: readonly string[];
  readonly by: UniqueSelector;
  readonly createValues: RepositoryRecord;
  readonly createRelations?: RelationMutationAst;
  readonly updateValues: RepositoryRecord;
  readonly updateRelations?: RelationMutationAst;
  readonly ifVersion?: string | number;
  readonly select?: SelectAst;
}

export interface RepositoryUpdateManyPlan {
  readonly collection: CollectionDefinition;
  readonly filter?: FilterAst;
  readonly all: boolean;
  readonly values: RepositoryRecord;
  readonly fields?: readonly string[];
  readonly select?: SelectAst;
}

export interface RepositoryDeleteOnePlan {
  readonly collection: CollectionDefinition;
  readonly filter: FilterAst;
  readonly ifVersion?: string | number;
  readonly fields?: readonly string[];
  readonly select?: SelectAst;
}

export interface RepositoryDeleteManyPlan {
  readonly collection: CollectionDefinition;
  readonly filter?: FilterAst;
  readonly all: boolean;
  readonly fields?: readonly string[];
  readonly select?: SelectAst;
}

export interface RepositoryExecutedMutation {
  readonly record: RepositoryRecord;
  readonly createdTargets: readonly CreatedTargetReference[];
  readonly version?: string | number;
}

export interface RepositoryDeletedMutation {
  readonly record: RepositoryRecord;
}

export interface RepositoryExecutedManyMutation {
  readonly count: number;
  readonly records?: readonly RepositoryRecord[];
}

export type RepositorySingleMutationMiss = 'missing' | 'multiple' | 'conflict';

/** Internal adapter boundary. Plans contain logical Collection and Field names only. */
export interface RepositoryExecutionAdapter {
  assertReadable(): void;
  findMany(plan: RepositoryReadPlan): Promise<RepositoryRecord[]>;
  stream(plan: RepositoryReadPlan): AsyncIterable<RepositoryRecord>;
  findOne(plan: RepositoryReadPlan): Promise<RepositoryRecord | undefined>;
  count(plan: RepositoryFilterPlan): Promise<number>;
  exists(plan: RepositoryFilterPlan): Promise<boolean>;
  aggregate(plan: RepositoryAggregatePlan): Promise<RepositoryRecord>;
  groupBy(plan: RepositoryGroupByPlan): Promise<RepositoryRecord[]>;
  createOne(plan: RepositoryCreateOnePlan): Promise<RepositoryExecutedMutation>;
  createMany(
    plan: RepositoryCreateManyPlan,
  ): Promise<RepositoryExecutedManyMutation>;
  updateOne(
    plan: RepositoryUpdateOnePlan,
  ): Promise<RepositoryExecutedMutation | RepositorySingleMutationMiss>;
  upsertOne(
    plan: RepositoryUpsertOnePlan,
  ): Promise<RepositoryExecutedMutation | 'conflict'>;
  updateMany(
    plan: RepositoryUpdateManyPlan,
  ): Promise<RepositoryExecutedManyMutation>;
  deleteOne(
    plan: RepositoryDeleteOnePlan,
  ): Promise<
    'deleted' | RepositoryDeletedMutation | RepositorySingleMutationMiss
  >;
  deleteMany(
    plan: RepositoryDeleteManyPlan,
  ): Promise<RepositoryExecutedManyMutation>;
}

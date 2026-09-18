import type { Actor } from '../types.js';
import type { DatabaseManager } from '@nocobase/db';
import type { AppAuthorizationService } from '@nocobase/app-plugin-authorization/server';

export type DataScalar = string | number | boolean | null;
export interface DataPageInput {
  limit?: number;
  offset?: number;
}
export interface DataSourceInput extends DataPageInput {
  dataSource?: string;
}
export interface DataCollectionInput {
  dataSource?: string;
  collection: string;
}
export interface DataMetadataInput extends DataCollectionInput, DataPageInput {}
export interface DataSearchInput extends DataSourceInput {
  collection?: string;
  query: string;
}
export interface DataCondition {
  field: string;
  operator:
    | 'eq'
    | 'ne'
    | 'gt'
    | 'gte'
    | 'lt'
    | 'lte'
    | 'in'
    | 'notIn'
    | 'includes'
    | 'startsWith'
    | 'endsWith'
    | 'empty'
    | 'notEmpty'
    | 'dateOn'
    | 'dateBefore'
    | 'dateAfter'
    | 'dateNotBefore'
    | 'dateNotAfter';
  value?: DataScalar | DataScalar[];
}
/** A deliberately flat AND of conditions; no raw Repository AST or variables. */
export interface DataFilterInput extends DataCollectionInput {
  filter?: DataCondition[];
}
export interface DataSort {
  field: string;
  direction: 'asc' | 'desc';
}
export interface DataRelationInput {
  relation: string;
  fields: string[];
  limit?: number;
}
export interface DataRowsInput extends DataFilterInput, DataPageInput {
  fields: string[];
  sort?: DataSort[];
  relations?: DataRelationInput[];
}
export type DataAggregate =
  | { function: 'count'; alias: string; field?: string }
  | { function: 'sum' | 'avg' | 'min' | 'max'; alias: string; field: string };
/** Domains bound the product of possible groups to 100 before executing SQL. */
export interface DataGroup {
  field: string;
  values: DataScalar[];
}
export interface DataAggregateInput extends DataFilterInput {
  aggregates: DataAggregate[];
  groupBy?: DataGroup[];
  sort?: DataSort[];
}
export type DataValue = DataScalar | DataValue[] | { [key: string]: DataValue };
export type DataRow = Record<string, DataValue>;
export interface DataPage<T> {
  items: T[];
  limit: number;
  offset: number;
  hasMore: boolean;
}
export interface DataSourceSummary {
  name: string;
}
export interface DataCollectionSummary {
  name: string;
  title?: string;
  description?: string;
}
export interface DataFieldSummary {
  name: string;
  type: string;
  title?: string;
  description?: string;
  nullable?: boolean;
  relation?: {
    target: string;
    cardinality: 'one' | 'many';
    queryable: boolean;
  };
}
export interface DataMetadataResult extends DataCollectionSummary {
  dataSource: string;
  fields: DataPage<DataFieldSummary>;
}
export interface DataFieldMatch extends DataFieldSummary {
  collection: string;
  match: 'exact' | 'candidate';
}
export interface DataRowsResult extends DataPage<DataRow> {
  truncated: boolean;
  timezone: string;
}
export interface DataAggregateResult {
  items: DataRow[];
  truncated: boolean;
  timezone: string;
}
export interface DataServices {
  getDataSources(input: DataPageInput): Promise<DataPage<DataSourceSummary>>;
  getCollectionNames(
    input: DataSourceInput,
  ): Promise<DataPage<DataCollectionSummary>>;
  getCollectionMetadata(input: DataMetadataInput): Promise<DataMetadataResult>;
  searchFieldMetadata(
    input: DataSearchInput,
  ): Promise<DataPage<DataFieldMatch>>;
  dataSourceQuery(input: DataRowsInput): Promise<DataRowsResult>;
  dataSourceCounting(input: DataFilterInput): Promise<{ count: number }>;
  dataQuery(input: DataAggregateInput): Promise<DataAggregateResult>;
}
export interface CreateDataServicesOptions {
  database: DatabaseManager;
  authorization?: AppAuthorizationService;
  actor: Actor;
  /** Trusted IANA execution timezone; predicates still require explicit date/instant values. */
  timezone?: string;
}

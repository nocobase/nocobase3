import type { CollectionDefinition, CollectionKind } from '../types.js';
import type { CollectionResolutionResult } from '../resolver/types.js';
import type { CollectionResolutionIssueCode } from '../resolver/errors.js';
import type {
  ListPhysicalCollectionsOptions,
  PhysicalCollectionSchema,
  ScanPhysicalCollectionsOptions,
} from '../../schema/inspector/types.js';

export type ListCollectionsOptions = ListPhysicalCollectionsOptions;

export type ScanCollectionsOptions = ScanPhysicalCollectionsOptions;

export interface CollectionSummary {
  readonly name: string;
  readonly tableName: string;
  readonly schema: string;
  readonly kind: CollectionKind;
  readonly title?: string;
  readonly description?: string;
}

export interface CollectionSummaryPage {
  readonly items: readonly CollectionSummary[];
  readonly nextCursor?: string;
}

export interface ConnectionCollections {
  get(name: string): Promise<CollectionDefinition | undefined>;
  /**
   * Reads the physical database schema backing a logical Collection name.
   * Use schemaInspector.getPhysicalCollection() when the input is already a
   * physical table name.
   */
  getPhysical(name: string): Promise<PhysicalCollectionSchema | undefined>;
  getResolution(name: string): Promise<CollectionResolutionResult | undefined>;
  list(options?: ListCollectionsOptions): Promise<CollectionSummaryPage>;
  scan(options?: ScanCollectionsOptions): AsyncIterable<CollectionDefinition>;
  refresh(name: string): Promise<CollectionDefinition | undefined>;
  invalidate(name?: string): void;
  validateRelations(name?: string): Promise<void>;
  /**
   * Compares every stored metadata record with the physical schema behind it.
   *
   * The two are separate records of what exists, and a hand-rolled reset or a
   * table dropped outside a migration leaves them disagreeing — after which
   * resolving that Collection fails, and so does anything that resolves it.
   * Reads only.
   */
  diagnose(): Promise<CollectionDiagnosis>;
}

/** What a metadata record and its physical table disagree about. */
export interface CollectionDiagnosisIssue {
  readonly name: string;
  /** The physical table the record maps to. */
  readonly tableName: string;
  readonly code: CollectionDiagnosisIssueCode | CollectionResolutionIssueCode;
  readonly message: string;
  /**
   * The record describes a table that does not exist, so deleting the record
   * is a complete fix. Every other issue needs a migration: the table is
   * there and something about it no longer matches what was recorded.
   */
  readonly orphaned: boolean;
}

export type CollectionDiagnosisIssueCode = 'COLLECTION_TABLE_MISSING';

export interface CollectionDiagnosis {
  /** Metadata records examined. */
  readonly checked: number;
  readonly issues: readonly CollectionDiagnosisIssue[];
}

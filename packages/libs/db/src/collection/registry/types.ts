import type { CollectionDefinition, CollectionKind } from '../types.js';
import type { CollectionResolutionResult } from '../resolver/types.js';
import type {
  ListPhysicalCollectionsOptions,
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
  getResolution(name: string): Promise<CollectionResolutionResult | undefined>;
  list(options?: ListCollectionsOptions): Promise<CollectionSummaryPage>;
  scan(options?: ScanCollectionsOptions): AsyncIterable<CollectionDefinition>;
  refresh(name: string): Promise<CollectionDefinition | undefined>;
  invalidate(name?: string): void;
  validateRelations(name?: string): Promise<void>;
}

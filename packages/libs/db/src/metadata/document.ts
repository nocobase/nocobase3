import type {
  NamingOptions,
  OptimisticLockDefinition,
  RelationType,
} from '../collection/types.js';

export interface CollectionMetadataDocument {
  version: 1;
  name: string;
  naming?: NamingOptions;
  title?: string;
  description?: string;
  optimisticLock?: OptimisticLockDefinition;
  fields?: Record<string, FieldMetadata>;
  relations?: Record<string, RelationMetadata>;
}

export interface FieldMetadata {
  /** Explicit semantic types whose physical representation is ambiguous. */
  type?: 'boolean' | 'json' | 'date' | 'time';
  title?: string;
  description?: string;
}

export interface RelationMetadata {
  type: RelationType;
  target: string;
  sourceKey?: string;
  targetKey?: string;
  foreignKey?: string;
  otherKey?: string;
  through?: string;
  title?: string;
  description?: string;
}

export interface StoredCollectionMetadata {
  document: CollectionMetadataDocument;
  revision: string | number;
}

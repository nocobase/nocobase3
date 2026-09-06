import type {
  NamingOptions,
  OptimisticLockDefinition,
  RelationType,
  FieldType,
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
  /** Explicit scalar semantic type; physical structure remains inspector-owned. */
  type?: FieldType;
  values?: readonly string[];
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

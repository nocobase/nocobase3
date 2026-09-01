import type {
  CollectionDefinition,
  CollectionMetadataDocument,
  CollectionResolutionIssueCode,
  NamingOptions,
  PhysicalCollectionSchema,
} from '../../../src/index.js';

export interface ResolverSuccessFixture {
  readonly name: string;
  readonly physical: PhysicalCollectionSchema;
  readonly metadata?: CollectionMetadataDocument;
  readonly naming?: NamingOptions;
  readonly expected: Partial<CollectionDefinition>;
}

export interface ResolverFailureFixture {
  readonly name: string;
  readonly physical: PhysicalCollectionSchema;
  readonly metadata?: CollectionMetadataDocument;
  readonly naming?: NamingOptions;
  readonly expectedIssues: readonly {
    readonly code: CollectionResolutionIssueCode;
    readonly path?: readonly (string | number)[];
  }[];
}

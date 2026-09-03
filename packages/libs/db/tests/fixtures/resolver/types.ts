import type {
  CollectionDefinition,
  CollectionMetadataDocument,
} from '../../../src/index.js';
import type { NamingOptions } from '../../../src/collection/types.js';
import type { PhysicalCollectionSchema } from '../../../src/schema/inspector/types.js';
import type { CollectionResolutionIssueCode } from '../../../src/collection/resolver/index.js';

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

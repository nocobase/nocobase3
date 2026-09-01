import type {
  ListPhysicalCollectionsOptions,
  PhysicalCollectionIdentifier,
  PhysicalCollectionPage,
  PhysicalCollectionSchema,
  PhysicalSchemaInfo,
  ScanPhysicalCollectionsOptions,
} from './types.js';

export interface SchemaInspector {
  listSchemas(): Promise<PhysicalSchemaInfo[]>;
  getPhysicalCollection(
    identifier: PhysicalCollectionIdentifier,
  ): Promise<PhysicalCollectionSchema | undefined>;
  listPhysicalCollections(
    options?: ListPhysicalCollectionsOptions,
  ): Promise<PhysicalCollectionPage>;
  scanPhysicalCollections(
    options?: ScanPhysicalCollectionsOptions,
  ): AsyncIterable<PhysicalCollectionSchema>;
}

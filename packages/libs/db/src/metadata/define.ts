import type { CollectionMetadataDocument } from './document.js';

export function defineCollectionMetadata<T extends CollectionMetadataDocument>(
  document: T,
): T {
  return document;
}

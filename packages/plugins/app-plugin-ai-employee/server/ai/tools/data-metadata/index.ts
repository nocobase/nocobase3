import { defineDataTool } from '../data-tool.js';
import {
  getDataSourcesSchema,
  getCollectionNamesSchema,
  getCollectionMetadataSchema,
  searchFieldMetadataSchema,
} from '../../../service/data-schemas.js';

export const getDataSources = defineDataTool(
  'getDataSources',
  'List data sources',
  'List authorized named database connections. Only explicitly mapped registered collections are discoverable. Results are paginated (limit 1–100, offset at most 10000).',
  getDataSourcesSchema,
  (service, input) => service.getDataSources(input),
);
export const getCollectionNames = defineDataTool(
  'getCollectionNames',
  'List collections',
  'List accessible registered collections in dataSource (default main). Paginated; physical tables without authorization mappings are not exposed.',
  getCollectionNamesSchema,
  (service, input) => service.getCollectionNames(input),
);
export const getCollectionMetadata = defineDataTool(
  'getCollectionMetadata',
  'Get collection metadata',
  'Read normalized accessible fields and queryable relationships for collection in dataSource (default main). Fields are paginated; no credentials or internal definitions are returned.',
  getCollectionMetadataSchema,
  (service, input) => service.getCollectionMetadata(input),
);
export const searchFieldMetadata = defineDataTool(
  'searchFieldMetadata',
  'Search field metadata',
  'Search accessible field names, titles, and descriptions within dataSource (default main), optionally collection. Results mark exact matches versus candidates; candidates require confirmation.',
  searchFieldMetadataSchema,
  (service, input) => service.searchFieldMetadata(input),
);

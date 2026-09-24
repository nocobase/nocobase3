import { defineDataTool } from '../data-tool.js';
import {
  dataSourceQuerySchema,
  dataSourceCountingSchema,
  dataQuerySchema,
} from '../../../service/data-schemas.js';

export const dataSourceQuery = defineDataTool(
  'dataSourceQuery',
  'Query records',
  'Query authorized detail records using selected fields, a flat AND filter of field/operator/value conditions, sort, limit (1–100), and offset (0–10000). Optional relations support explicit one-hop non-through joins only, with separately authorized target fields and record scopes. Big integers and exact decimals remain strings. Inspect hasMore and truncated; no SQL, raw AST, nested filters, or identity overrides.',
  dataSourceQuerySchema,
  (service, input) => service.dataSourceQuery(input),
);
export const dataSourceCounting = defineDataTool(
  'dataSourceCounting',
  'Count records',
  'Count records in the same authorized read scope as detail queries. Accepts collection, optional dataSource (default main), and flat AND filter conditions. No SQL or identity overrides.',
  dataSourceCountingSchema,
  (service, input) => service.dataSourceCounting(input),
);
export const dataQuery = defineDataTool(
  'dataQuery',
  'Aggregate data',
  'Run server-side count/sum/avg/min/max aggregates, each with a unique alias and field (optional for count). Optional groupBy requires explicit field value domains with at most 100 possible group combinations; results cover only those domains. Sort grouped fields or aliases. Uses the same field permissions and record scope as details. No expressions, SQL, arbitrary dimensions, or whole-table in-memory computation.',
  dataQuerySchema,
  (service, input) => service.dataQuery(input),
);

import type { DatabaseDialect } from '../../database/config.js';

export type SchemaInspectorErrorCode =
  | 'SCHEMA_INSPECTION_FAILED'
  | 'SCHEMA_INSPECTION_PERMISSION_DENIED'
  | 'SCHEMA_INSPECTION_INVALID_CURSOR'
  | 'SCHEMA_INSPECTION_INVALID_OPTIONS'
  | 'SCHEMA_INSPECTION_UNSUPPORTED_DIALECT';

export interface SchemaInspectorErrorOptions {
  readonly code: SchemaInspectorErrorCode;
  readonly connectionName: string;
  readonly dialect: DatabaseDialect;
  readonly schema?: string;
  readonly tableName?: string;
  readonly cause?: unknown;
}

export class SchemaInspectorError extends Error {
  readonly code: SchemaInspectorErrorCode;
  readonly connectionName: string;
  readonly dialect: DatabaseDialect;
  readonly schema?: string;
  readonly tableName?: string;

  constructor(message: string, options: SchemaInspectorErrorOptions) {
    super(message, { cause: options.cause });
    this.name = 'SchemaInspectorError';
    this.code = options.code;
    this.connectionName = options.connectionName;
    this.dialect = options.dialect;
    this.schema = options.schema;
    this.tableName = options.tableName;
  }
}

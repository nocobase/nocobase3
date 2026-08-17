import type { SchemaOperation } from './types.js';

export interface DatabaseCapabilities {
  schemas: boolean;
  views: boolean;
  replaceView: boolean;
  materializedViews: boolean;
  refreshMaterializedViews: boolean;
  foreignKeys: boolean;
  deferrableConstraints: boolean;
  partialIndexes: boolean;
  nativeTypes: boolean;
  comments: boolean;
}

export interface SchemaAdapter {
  dialect?: string;
  capabilities?: DatabaseCapabilities;
  execute(operations: SchemaOperation[]): Promise<void>;
  compile?(operations: SchemaOperation[]): Promise<string[]>;
}

export class NoopSchemaAdapter implements SchemaAdapter {
  async execute(): Promise<void> {}

  async compile(): Promise<string[]> {
    return [];
  }
}

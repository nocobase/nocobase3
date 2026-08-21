import type { SchemaAdapter } from '../../../src/schema/index.js';
import type { SchemaOperation } from '../../../src/index.js';

export class RecordingSchemaAdapter implements SchemaAdapter {
  executed: SchemaOperation[][] = [];

  constructor(private readonly sql: string[] = []) {}

  async execute(operations: SchemaOperation[]): Promise<void> {
    this.executed.push(operations);
  }

  async compile(): Promise<string[]> {
    return this.sql;
  }
}

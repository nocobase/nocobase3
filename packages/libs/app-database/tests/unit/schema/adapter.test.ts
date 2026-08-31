import { describe, expect, it } from 'vitest';
import {
  NoopSchemaAdapter,
  type SchemaAdapter,
} from '../../../src/schema/index.js';

describe('NoopSchemaAdapter', () => {
  it('accepts schema operations without executing anything', async () => {
    const adapter: SchemaAdapter = new NoopSchemaAdapter();

    await expect(
      adapter.execute([
        {
          type: 'dropTable',
          tableName: 'legacy_logs',
        },
      ]),
    ).resolves.toBeUndefined();
    await expect(adapter.compile!([])).resolves.toEqual([]);
  });
});

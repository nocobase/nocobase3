// @vitest-environment node

import { createDatabaseManager } from '@nocobase/db';
import { afterEach, describe, expect, it } from 'vitest';

import createAuthenticationTables from '../../database/migrations/202608200001_create_authentication_tables.js';
import addUserDisabledAt from '../../database/migrations/202609080001_add_user_disabled_at.js';

interface SqliteClient {
  readonly schema: {
    hasColumn(table: string, column: string): Promise<boolean>;
  };
}

describe('@nocobase/app-plugin-authentication database migrations', () => {
  const databases: ReturnType<typeof createDatabaseManager>[] = [];

  afterEach(async () => {
    await Promise.all(
      databases.splice(0).map((database) => database.destroy()),
    );
  });

  it('adds and removes the user disabledAt field', async () => {
    const database = createDatabaseManager({
      default: 'main',
      connections: { main: { dialect: 'sqlite', filename: ':memory:' } },
    });
    databases.push(database);
    const connection = database.connection();
    const context = {
      builder: connection.builder,
      query: connection.query,
      connection,
    };
    await createAuthenticationTables.up(context);
    await addUserDisabledAt.up(context);
    const client = await connection.client<SqliteClient>();

    await expect(client.schema.hasColumn('user', 'disabled_at')).resolves.toBe(
      true,
    );

    await addUserDisabledAt.down?.(context);
    await expect(client.schema.hasColumn('user', 'disabled_at')).resolves.toBe(
      false,
    );
  });
});

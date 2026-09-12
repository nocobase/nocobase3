import { EventEmitter } from 'node:events';
import { PassThrough, Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { createDatabaseManager } from '@nocobase/db';
import postgres from '../src/index.js';

describe('postgres factory', () => {
  it('binds the dialect driver to the connection', () => {
    const connection = postgres({
      host: 'localhost',
      driver: 'mysql2',
    } as never);
    expect(connection).toMatchObject({
      dialect: 'postgres',
      driver: 'pg',
      databaseDriver: postgres.driver,
      host: 'localhost',
    });
  });

  it('normalizes flattened connection options', () => {
    expect(
      postgres.driver.resolveConnection?.({
        dialect: 'postgres',
        host: 'localhost',
        database: 'app',
        username: 'app',
        driverOptions: { application_name: 'nocobase' },
      }),
    ).toEqual({
      connection: {
        application_name: 'nocobase',
        host: 'localhost',
        database: 'app',
        user: 'app',
      },
      searchPath: undefined,
    });
  });

  it('loads pg-query-stream from the dialect package', async () => {
    const manager = createDatabaseManager({
      connections: {
        main: postgres({ host: 'localhost', database: 'app' }),
      },
    });
    try {
      const client = await manager.connection().client<any>();
      const output = new PassThrough();
      const query = client.client._stream(
        {
          query(input: unknown) {
            expect(input).toBeDefined();
            expect(
              (input as { constructor: { name: string } }).constructor.name,
            ).toBe('QueryStream');
            return Readable.from([]);
          },
        },
        { sql: 'select 1', bindings: [] },
        output,
        {},
      );
      await expect(query).resolves.toBeUndefined();
    } finally {
      await manager.destroy();
    }
  });

  it('propagates query-stream failures to the promise and output stream', async () => {
    const manager = createDatabaseManager({
      connections: {
        main: postgres({ host: 'localhost', database: 'app' }),
      },
    });
    try {
      const client = await manager.connection().client<any>();
      const output = new PassThrough();
      const emitted = vi.fn();
      output.on('error', emitted);
      const failure = new Error('stream failed');
      const query = client.client._stream(
        {
          query() {
            const source = new EventEmitter() as EventEmitter & {
              pipe(destination: NodeJS.WritableStream): NodeJS.WritableStream;
            };
            source.pipe = (destination) => destination;
            queueMicrotask(() => source.emit('error', failure));
            return source;
          },
        },
        { sql: 'select 1', bindings: [] },
        output,
        {},
      );

      await expect(query).rejects.toThrow('stream failed');
      expect(emitted).toHaveBeenCalledWith(failure);
    } finally {
      await manager.destroy();
    }
  });
});

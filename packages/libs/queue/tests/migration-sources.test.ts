import { expect, it } from 'vitest';
import { resolveQueueMigrationSources } from '../src/database/index.js';

it('rejects partially overlapping active tables before executing migrations', () => {
  expect(() =>
    resolveQueueMigrationSources(
      {
        default: 'a',
        connections: {
          a: { driver: 'database', table: 'jobs', schedulesTable: 'timers_a' },
          b: { driver: 'database', table: 'jobs', schedulesTable: 'timers_b' },
        },
      },
      { defaultDatabaseConnection: 'main' },
    ),
  ).toThrow('table "jobs" on connection "main"');
});

it('merges aliases but keeps identical names on different connections separate', () => {
  const targets = resolveQueueMigrationSources(
    {
      default: 'a',
      connections: {
        a: { driver: 'database' },
        alias: { driver: 'database' },
        remote: { driver: 'database', connection: 'other' },
      },
    },
    { defaultDatabaseConnection: 'main' },
  );
  expect(targets.map((target) => target.connection)).toEqual(['main', 'other']);
  expect(targets[0].source.configuration).toHaveLength(2);
});

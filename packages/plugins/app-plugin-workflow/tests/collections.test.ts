import {
  createDatabaseManager,
  InMemoryCollectionMetadataStore,
  type CollectionDefinition,
} from '@nocobase/db';
import type { Knex } from 'knex';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  WORKFLOW_COLLECTIONS,
  workflowCollectionSchemas,
} from '../server/collections/index.js';
import { createWorkflowCollections } from './helpers.js';

describe('workflow collections', () => {
  let database: ReturnType<typeof createDatabaseManager>;
  let metadataStore: InMemoryCollectionMetadataStore;

  beforeEach(() => {
    metadataStore = new InMemoryCollectionMetadataStore();
    database = createDatabaseManager({
      default: 'main',
      metadataStore,
      connections: {
        main: {
          dialect: 'sqlite',
          filename: ':memory:',
        },
      },
    });
  });

  afterEach(async () => {
    await database.destroy();
  });

  it('creates the six workflow tables with NocoBase 3 naming', async () => {
    await createWorkflowCollections(database.builder());
    const db = await database.connection().client<Knex>();

    await expect(
      Promise.all([
        db.schema.hasTable('workflows'),
        db.schema.hasTable('workflow_nodes'),
        db.schema.hasTable('workflow_runs'),
        db.schema.hasTable('workflow_node_runs'),
        db.schema.hasTable('workflow_stats'),
        db.schema.hasTable('workflow_version_stats'),
      ]),
    ).resolves.toEqual([true, true, true, true, true, true]);

    await expect(
      db.schema.hasColumn('workflow_nodes', 'workflow_id'),
    ).resolves.toBe(true);
    await expect(
      db.schema.hasColumn('workflow_runs', 'event_key'),
    ).resolves.toBe(true);
    await expect(db.schema.hasColumn('workflow_runs', 'input')).resolves.toBe(
      true,
    );
    await expect(
      db.schema.hasColumn('workflow_runs', 'parameters'),
    ).resolves.toBe(true);
    await expect(
      db.schema.hasColumn('workflow_runs', 'parent_run_id'),
    ).resolves.toBe(true);
    await expect(db.schema.hasColumn('workflow_runs', 'hash')).resolves.toBe(
      true,
    );
    await expect(
      db.schema.hasColumn('workflow_runs', 'finished_at'),
    ).resolves.toBe(true);
    await expect(
      db.schema.hasColumn('workflows', 'parameters_schema'),
    ).resolves.toBe(true);
    await expect(
      db.schema.hasColumn('workflows', 'parameter_values'),
    ).resolves.toBe(true);
    await expect(
      db.schema.hasColumn('workflow_nodes', 'description'),
    ).resolves.toBe(true);
    await expect(
      db.schema.hasColumn('workflow_node_runs', 'error'),
    ).resolves.toBe(true);
    await expect(
      db.schema.hasColumn('workflow_node_runs', 'node_id'),
    ).resolves.toBe(true);
    await expect(
      db.schema.hasColumn('workflow_node_runs', 'finished_at'),
    ).resolves.toBe(true);
  });

  it('preserves workflow indexes and relation metadata without physical foreign keys', async () => {
    await createWorkflowCollections(database.builder());
    const db = await database.connection().client<Knex>();

    const workflowIndexes = await db.raw('PRAGMA index_list(workflows)');
    expect(workflowIndexes).toEqual(
      expect.arrayContaining([expect.objectContaining({ unique: 1 })]),
    );

    const runIndexes = await db.raw('PRAGMA index_list(workflow_runs)');
    expect(runIndexes).toHaveLength(5);

    await expect(
      db.raw('PRAGMA foreign_key_list(workflow_node_runs)'),
    ).resolves.toEqual([]);
    await expect(
      db.raw('PRAGMA foreign_key_list(workflow_nodes)'),
    ).resolves.toEqual([]);
    await expect(
      db.raw('PRAGMA foreign_key_list(workflow_runs)'),
    ).resolves.toEqual([]);

    const [workflowId] = await db('workflows').insert({ key: 'order-created' });
    const [nodeId] = await db('workflow_nodes').insert({
      key: 'start',
      workflow_id: workflowId,
      type: 'start',
    });
    const [runId] = await db('workflow_runs').insert({
      workflow_id: workflowId,
      workflow_key: 'order-created',
      event_key: 'event-1',
      created_at: new Date().toISOString(),
    });
    await db('workflow_node_runs').insert({
      workflow_run_id: runId,
      node_id: nodeId,
      node_key: 'start',
      status: 1,
      started_at: new Date().toISOString(),
    });
    // Relations are logical, so deleting a run leaves its node runs untouched at the
    // database level; cascading is the application layer's responsibility.
    await db('workflow_runs').where({ id: runId }).delete();
    await expect(
      db('workflow_node_runs').where({ workflow_run_id: runId }),
    ).resolves.toHaveLength(1);

    await expect(
      Promise.all(
        workflowCollectionSchemas.map(({ name }) =>
          metadataStore.getCollection(name),
        ),
      ),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: WORKFLOW_COLLECTIONS.workflows }),
        expect.objectContaining({ name: WORKFLOW_COLLECTIONS.nodes }),
        expect.objectContaining({ name: WORKFLOW_COLLECTIONS.runs }),
        expect.objectContaining({ name: WORKFLOW_COLLECTIONS.nodeRuns }),
        expect.objectContaining({ name: WORKFLOW_COLLECTIONS.stats }),
        expect.objectContaining({ name: WORKFLOW_COLLECTIONS.versionStats }),
      ]),
    );

    const dryRun = await createWorkflowCollections(database.builder(), {
      dryRun: true,
    });
    const workflows = dryRun[0].operations[0] as {
      definition: CollectionDefinition;
    };
    expect(workflows.definition.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'nodes',
          type: 'hasMany',
          target: WORKFLOW_COLLECTIONS.nodes,
        }),
        expect.objectContaining({ name: 'revisions', constraints: false }),
        expect.objectContaining({
          name: 'versionStats',
          target: WORKFLOW_COLLECTIONS.versionStats,
        }),
      ]),
    );
  });
});

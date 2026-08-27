// @vitest-environment node
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createDatabaseManager,
  type DatabaseManager,
  type Row,
} from '@nocobase/app-database';
import {
  createQueueManager,
  createSyncQueueConfig,
  type NocoBaseQueueManager,
} from '@nocobase/queue';
import {
  buildWorkflowArtifact,
  writeWorkflowArtifact,
} from '../server/loader/artifact-builder.js';
import {
  createAppWorkflowRuntime,
  disposeAppWorkflowRuntime,
} from '../server/runtime/runtime.js';
import { WorkflowRepository } from '../server/services/workflow-repository.js';
import { WorkflowRunRepository } from '../server/services/workflow-run-repository.js';
import {
  WORKFLOW_COLLECTIONS,
  workflowCollectionSchemas,
} from '../server/collections/index.js';
import { trigger } from '../server/trigger.js';

const roots: string[] = [];
const databases: DatabaseManager[] = [];
const queues: NocoBaseQueueManager[] = [];
async function createWorkflowCollections(
  database: DatabaseManager,
): Promise<void> {
  for (const schema of workflowCollectionSchemas) {
    await database.builder().createCollection(schema.name, schema.define);
  }
}
afterEach(async () => {
  await Promise.all(queues.splice(0).map((queue) => queue.close()));
  await Promise.all(databases.splice(0).map((database) => database.destroy()));
  await Promise.all(
    roots
      .splice(0)
      .map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});
async function fixture(): Promise<{
  root: string;
  distRoot: string;
  storeRoot: string;
  database: DatabaseManager;
  queue: NocoBaseQueueManager;
}> {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), 'app-workflow-startup-'),
  );
  roots.push(root);
  const database = createDatabaseManager({
    connections: { main: { dialect: 'sqlite', filename: ':memory:' } },
  });
  databases.push(database);
  await createWorkflowCollections(database);
  const queue = createQueueManager(createSyncQueueConfig());
  queues.push(queue);
  return {
    root,
    distRoot: path.join(root, 'dist/server/workflows'),
    storeRoot: path.join(root, 'storage/private'),
    database,
    queue,
  };
}
async function emit(distRoot: string, title: string): Promise<string> {
  const node = {
    key: 'run',
    title: 'Run',
    type: 'run',
    config: { script: './server/run.ts' },
    upstreamKey: null,
    downstreamKey: null,
    branchKey: null,
  };
  const flatIr = {
    title,
    contextSchema: { type: 'object' as const },
    start: 'run',
    nodes: [node],
  };
  const built = buildWorkflowArtifact({
    scanned: { key: 'sample', root: '/ci/source', entries: [] },
    definition: { title, contextSchema: flatIr.contextSchema, nodes: [] },
    flatIr,
    serverEntries: {
      one: {
        source: './server/run.ts',
        output: 'server/run/one.cjs',
        exports: ['run'],
      },
    },
    serverEntryFiles: new Map([
      ['server/run/one.cjs', `exports.run=()=>(${JSON.stringify(title)})`],
    ]),
  });
  await writeWorkflowArtifact(built, distRoot);
  return built.digest;
}
function runtime(f: Awaited<ReturnType<typeof fixture>>) {
  return createAppWorkflowRuntime({
    database: f.database,
    queue: f.queue,
    sourceRoot: path.join(f.root, 'server/workflows'),
    distRoot: f.distRoot,
    artifactDisk: {
      driver: 'fs',
      location: f.storeRoot,
      visibility: 'private',
    },
    production: true,
    sourceResolverDiagnostic: false,
  });
}
describe('application workflow Artifact lazy synchronization', () => {
  it('discovers without writes, materializes on enable, and publishes a new deployed revision on trigger', async () => {
    const f = await fixture();
    const v1 = await emit(f.distRoot, 'v1');
    const firstRuntime = runtime(f);
    const firstService = new WorkflowRepository(f.database, firstRuntime);
    const discovered = await firstService.list();
    expect(discovered.data).toEqual([
      expect.objectContaining({
        id: null,
        key: 'sample',
        enabled: false,
        hash: v1,
      }),
    ]);
    expect(
      await f.database
        .query()
        .selectFrom(WORKFLOW_COLLECTIONS.workflows)
        .exists(),
    ).toBe(false);
    await firstService.enable(v1);
    const first = await f.database
      .query()
      .selectFrom(WORKFLOW_COLLECTIONS.workflows)
      .selectAll()
      .where('key', '=', 'sample')
      .executeTakeFirstOrThrow<Row>();
    expect(first.hash).toBe(v1);
    expect(Boolean(first.enabled)).toBe(true);
    expect(
      await fs.readdir(path.join(f.storeRoot, 'workflows/sample', v1)),
    ).toEqual(expect.arrayContaining(['workflow.json', 'server']));
    await firstService.setStatus(first.id as string, false);
    await expect(
      firstService.enable(first.id as string),
    ).resolves.toMatchObject({ id: String(first.id), enabled: true, hash: v1 });
    await trigger(firstRuntime, 'sample', {}, { eventKey: 'artifact-run' });
    const run = await f.database
      .query()
      .selectFrom(WORKFLOW_COLLECTIONS.runs)
      .selectAll()
      .where('eventKey', '=', 'artifact-run')
      .executeTakeFirstOrThrow<Row>();
    expect(run.hash).toBe(v1);
    const nodeRun = await f.database
      .query()
      .selectFrom(WORKFLOW_COLLECTIONS.nodeRuns)
      .select(['result'])
      .where('workflowRunId', '=', run.id)
      .executeTakeFirstOrThrow<Row>();
    expect(JSON.parse(String(nodeRun.result))).toBe('v1');
    await disposeAppWorkflowRuntime(firstRuntime);

    const v2 = await emit(f.distRoot, 'v2');
    const upgradeRuntime = runtime(f);
    const upgradeService = new WorkflowRunRepository(
      f.database,
      upgradeRuntime,
    );
    await trigger(upgradeRuntime, 'sample', {}, { eventKey: 'artifact-v2' });
    const revisions = await f.database
      .query()
      .selectFrom(WORKFLOW_COLLECTIONS.workflows)
      .selectAll()
      .where('key', '=', 'sample')
      .orderBy('id')
      .execute<Row>();
    expect(revisions).toHaveLength(2);
    expect(revisions[0].hash).toBe(v1);
    expect(Boolean(revisions[0].enabled)).toBe(false);
    expect(Boolean(revisions[0].current)).toBe(false);
    expect(revisions[1].hash).toBe(v2);
    expect(Boolean(revisions[1].enabled)).toBe(true);
    expect(Boolean(revisions[1].current)).toBe(true);
    expect(run.hash).toBe(v1);

    const manual = await upgradeService.run(
      revisions[0].id as string,
      {},
      {
        eventKey: 'manual-v1',
      },
    );
    expect(manual).toMatchObject({
      workflowId: String(revisions[0].id),
      workflowVersion: 'version-1',
      eventKey: 'manual-v1',
    });
    const manualRow = await f.database
      .query()
      .selectFrom(WORKFLOW_COLLECTIONS.runs)
      .selectAll()
      .where('eventKey', '=', 'manual-v1')
      .executeTakeFirstOrThrow<Row>();
    expect(Boolean(manualRow.manually)).toBe(true);
    expect(manualRow.hash).toBe(v1);
    await disposeAppWorkflowRuntime(upgradeRuntime);
  });
  it('does not inspect deployment for an unknown trigger and validates deployment only on discovery', async () => {
    const f = await fixture();
    const missing = runtime(f);
    const missingService = new WorkflowRepository(f.database, missing);
    await expect(trigger(missing, 'sample', {})).resolves.toEqual({
      status: 'skipped',
      reason: 'not-found',
    });
    await expect(missingService.list()).resolves.toMatchObject({ data: [] });
    await disposeAppWorkflowRuntime(missing);

    const digest = await emit(f.distRoot, 'bad');
    await fs.writeFile(
      path.join(f.distRoot, 'sample', digest, 'workflow.json'),
      '{}',
    );
    const tampered = runtime(f);
    const tamperedService = new WorkflowRepository(f.database, tampered);
    await expect(tamperedService.list()).rejects.toThrow(
      /invalid workflow.json/,
    );
    await disposeAppWorkflowRuntime(tampered);

    await fs.mkdir(path.join(f.distRoot, 'sample', 'a'.repeat(64)), {
      recursive: true,
    });
    const multiple = runtime(f);
    const multipleService = new WorkflowRepository(f.database, multiple);
    await expect(multipleService.list()).rejects.toThrow(/exactly one digest/);
    await disposeAppWorkflowRuntime(multiple);
    expect(() =>
      createAppWorkflowRuntime({
        database: f.database,
        queue: f.queue,
        distRoot: f.distRoot,
        artifactDisk: {
          driver: 'fs',
          location: f.storeRoot,
          visibility: 'private',
        },
        production: true,
        sourceResolverDiagnostic: true,
      }),
    ).toThrow(/forbidden in production/);
  });
});

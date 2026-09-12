// @vitest-environment node
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createDatabaseManager, type DatabaseManager } from '@nocobase/db';
import {
  createQueueManager,
  createSyncQueueConfig,
  type NocoBaseQueueManager,
} from '@nocobase/queue';
import { ServiceContainer } from '@nocobase/service-provider';
import {
  buildWorkflowArtifact,
  writeWorkflowArtifact,
} from '../build/artifact-builder.js';
import { WorkflowService } from '../server/service.js';
import { WorkflowRepository } from '../server/repositories/workflow-repository.js';
import { WorkflowRunRepository } from '../server/repositories/workflow-run-repository.js';
import {
  workflowCollectionSchemas,
  workflowStore,
} from '../server/collections/index.js';
import { asId, asIdFilter } from '../server/engine/utils.js';
import { requireRow } from './helpers.js';

const roots: string[] = [];
const databases: DatabaseManager[] = [];
const queues: NocoBaseQueueManager[] = [];
async function createWorkflowCollections(
  database: DatabaseManager,
): Promise<void> {
  await database.builder().createCollections(
    workflowCollectionSchemas.map(({ name, define }) => ({
      name,
      definition: define,
    })),
  );
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
    config: { module: './server/run' },
    upstreamKey: null,
    downstreamKey: null,
    branchKey: null,
  };
  const flatIr = {
    title,
    inputSchema: { type: 'object' as const },
    parameters: { label: { type: 'string' as const } },
    start: 'run',
    nodes: [node],
  };
  const built = buildWorkflowArtifact({
    key: 'sample',
    flatIr,
    resourceFiles: new Map([
      [
        'server/run.js',
        `export function run(){ return ${JSON.stringify(title)}; }`,
      ],
    ]),
  });
  await writeWorkflowArtifact(built, distRoot);
  return built.digest;
}
function createService(
  f: Awaited<ReturnType<typeof fixture>>,
  production: boolean = true,
) {
  return new WorkflowService({
    database: f.database,
    queue: f.queue,
    services: new ServiceContainer(),
    sourceRoot: path.join(f.root, 'server/workflows'),
    distRoot: f.distRoot,
    artifactDisk: {
      driver: 'fs',
      location: f.storeRoot,
      visibility: 'private',
    },
    production,
  });
}
describe('application workflow Artifact lazy synchronization', () => {
  it('loads TypeScript resources directly from the workflow package in development', async () => {
    const f = await fixture();
    const digest = await emit(f.distRoot, 'artifact');
    const sourcePackage = path.join(f.root, 'server/workflows/sample/server');
    await fs.mkdir(sourcePackage, { recursive: true });
    await fs.writeFile(
      path.join(sourcePackage, 'run.ts'),
      'export function run() { return "source"; }',
    );
    const service = createService(f, false);
    const repository = new WorkflowRepository(f.database, service);
    await repository.enable(digest);

    await service.trigger('sample', {}, { eventKey: 'development-source' });

    const run = await requireRow(
      workflowStore(f.database).runs.findOne({
        filter: { eventKey: 'development-source' },
        select: (select) => select.fields('id'),
      }),
      'The development-source run',
    );
    const nodeRun = await requireRow(
      workflowStore(f.database).nodeRuns.findOne({
        filter: { workflowRunId: asIdFilter(asId(run.id)) },
        select: (select) => select.fields('result'),
      }),
      'Its node run',
    );
    expect(JSON.parse(String(nodeRun.result))).toBe('source');
    await service.dispose();
  });

  it('materializes parameter settings as the first disabled current revision', async () => {
    const f = await fixture();
    const hash = await emit(f.distRoot, 'parameters');
    const service = createService(f);
    const repository = new WorkflowRepository(f.database, service);

    await expect(
      repository.updateParameters(hash, { label: 'configured' }),
    ).resolves.toMatchObject({ values: { label: 'configured' } });

    const revision = await requireRow(
      workflowStore(f.database).workflows.findOne({
        filter: { key: 'sample' },
      }),
      'The materialized revision',
    );
    expect(revision).toMatchObject({
      hash,
      version: 'version-1',
      current: true,
      enabled: false,
    });
    expect(JSON.parse(String(revision.parameterValues))).toEqual({
      label: 'configured',
    });
    await expect(repository.get(hash)).resolves.toMatchObject({
      id: String(revision.id),
      parameterValues: { label: 'configured' },
    });
    await service.dispose();
  });

  it('materializes revisions on demand without changing the current revision', async () => {
    const f = await fixture();
    const v1 = await emit(f.distRoot, 'v1');
    const firstService = createService(f);
    const firstRepository = new WorkflowRepository(f.database, firstService);
    const discovered = await firstRepository.list();
    expect(discovered.data).toEqual([
      expect.objectContaining({
        id: null,
        key: 'sample',
        enabled: false,
        hash: v1,
      }),
    ]);
    expect(await workflowStore(f.database).workflows.exists()).toBe(false);
    await firstRepository.enable(v1);
    const first = await requireRow(
      workflowStore(f.database).workflows.findOne({
        filter: { key: 'sample' },
      }),
      'The first revision',
    );
    expect(first.hash).toBe(v1);
    expect(Boolean(first.enabled)).toBe(true);
    expect(
      await fs.readdir(path.join(f.storeRoot, 'workflows/sample', v1)),
    ).toEqual(expect.arrayContaining(['workflow.json', 'server']));
    await fs.rm(path.join(f.storeRoot, 'workflows/sample', v1), {
      recursive: true,
    });
    const firstRuns = new WorkflowRunRepository(f.database, firstService);
    await expect(
      firstRuns.run(first.id as string, {}, { eventKey: 'recovered-run' }),
    ).resolves.toMatchObject({ eventKey: 'recovered-run' });
    await expect(
      fs.readdir(path.join(f.storeRoot, 'workflows/sample', v1)),
    ).resolves.toEqual(expect.arrayContaining(['workflow.json', 'server']));
    await firstRepository.setStatus(first.id as string, false);
    await expect(firstRepository.enable(v1)).resolves.toMatchObject({
      id: String(first.id),
      enabled: true,
      hash: v1,
    });
    await firstRepository.setStatus(first.id as string, false);
    await expect(
      firstRepository.enable(first.id as string),
    ).resolves.toMatchObject({ id: String(first.id), enabled: true, hash: v1 });
    await firstService.trigger('sample', {}, { eventKey: 'artifact-run' });
    const run = await requireRow(
      workflowStore(f.database).runs.findOne({
        filter: { eventKey: 'artifact-run' },
      }),
      'The artifact-run run',
    );
    expect(run.hash).toBe(v1);
    const nodeRun = await requireRow(
      workflowStore(f.database).nodeRuns.findOne({
        filter: { workflowRunId: asIdFilter(asId(run.id)) },
        select: (select) => select.fields('result'),
      }),
      'Its node run',
    );
    expect(JSON.parse(String(nodeRun.result))).toBe('v1');
    await firstService.dispose();

    const v2 = await emit(f.distRoot, 'v2');
    const upgradeService = createService(f);
    const upgradeRepository = new WorkflowRunRepository(
      f.database,
      upgradeService,
    );
    await upgradeService.trigger('sample', {}, { eventKey: 'artifact-v2' });
    const automatic = await requireRow(
      workflowStore(f.database).runs.findOne({
        filter: { eventKey: 'artifact-v2' },
      }),
      'The artifact-v2 run',
    );
    expect(automatic.hash).toBe(v1);
    expect(
      await workflowStore(f.database).workflows.findMany({
        filter: { key: 'sample' },
      }),
    ).toHaveLength(1);

    const manual = await upgradeRepository.run(
      v2,
      {},
      {
        eventKey: 'manual-v2',
      },
    );
    const revisions = await workflowStore(f.database).workflows.findMany({
      filter: { key: 'sample' },
      sort: (sort) => sort.field('id').asc(),
    });
    expect(revisions).toHaveLength(2);
    expect(revisions[0].hash).toBe(v1);
    expect(Boolean(revisions[0].enabled)).toBe(true);
    expect(Boolean(revisions[0].current)).toBe(true);
    expect(revisions[1].hash).toBe(v2);
    expect(Boolean(revisions[1].enabled)).toBe(false);
    expect(Boolean(revisions[1].current)).toBe(false);
    expect(manual).toMatchObject({
      workflowId: String(revisions[1].id),
      workflowVersion: 'version-2',
      eventKey: 'manual-v2',
    });
    const manualRow = await requireRow(
      workflowStore(f.database).runs.findOne({
        filter: { eventKey: 'manual-v2' },
      }),
      'The manual-v2 run',
    );
    expect(Boolean(manualRow.manually)).toBe(true);
    expect(manualRow.hash).toBe(v2);
    await upgradeService.dispose();
  });
  it('does not inspect deployment for an unknown trigger and validates deployment only on discovery', async () => {
    const f = await fixture();
    const missing = createService(f);
    const missingRepository = new WorkflowRepository(f.database, missing);
    await expect(missing.trigger('sample', {})).resolves.toEqual({
      status: 'skipped',
      reason: 'not-found',
    });
    await expect(missingRepository.list()).resolves.toMatchObject({ data: [] });
    await missing.dispose();

    const digest = await emit(f.distRoot, 'bad');
    await fs.writeFile(
      path.join(f.distRoot, 'sample', digest, 'workflow.json'),
      '{}',
    );
    const tampered = createService(f);
    const tamperedRepository = new WorkflowRepository(f.database, tampered);
    await expect(tamperedRepository.list()).rejects.toThrow(
      /invalid workflow.json/,
    );
    await tampered.dispose();

    await fs.mkdir(path.join(f.distRoot, 'sample', 'a'.repeat(64)), {
      recursive: true,
    });
    const multiple = createService(f);
    const multipleRepository = new WorkflowRepository(f.database, multiple);
    await expect(multipleRepository.list()).rejects.toThrow(
      /exactly one digest/,
    );
    await multiple.dispose();
  });
});

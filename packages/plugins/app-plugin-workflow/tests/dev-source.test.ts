// @vitest-environment node
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';
import {
  createDatabaseManager,
  type DatabaseManager,
  type Row,
} from '@nocobase/db';
import {
  createQueueManager,
  createSyncQueueConfig,
  type NocoBaseQueueManager,
} from '@nocobase/queue';
import { ServiceContainer } from '@nocobase/service-provider';

import { buildApplicationWorkflows } from '../build/index.js';
import { loadWorkflowSourcePackages } from '../build/dev-source.js';
import { WorkflowSourceCheckError } from '../build/source-issues.js';
import { coreInstructions } from '../server/instructions/index.js';
import { WorkflowService } from '../server/service.js';
import {
  WORKFLOW_COLLECTIONS,
  workflowCollectionSchemas,
} from '../server/collections/index.js';
import { echoInstruction } from './fixtures/instructions.js';

const authoringEntry = fileURLToPath(new URL('../index.ts', import.meta.url));
const roots: string[] = [];
const databases: DatabaseManager[] = [];
const queues: NocoBaseQueueManager[] = [];
const services: WorkflowService[] = [];
let queueSequence = 0;

afterEach(async () => {
  await Promise.all(services.splice(0).map((service) => service.dispose()));
  await Promise.all(queues.splice(0).map((queue) => queue.close()));
  await Promise.all(databases.splice(0).map((database) => database.destroy()));
  await Promise.all(
    roots
      .splice(0)
      .map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

async function application(): Promise<{ root: string; sourceRoot: string }> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'workflow-dev-source-'));
  roots.push(root);
  return { root, sourceRoot: path.join(root, 'server/workflows') };
}

async function writePackage(
  sourceRoot: string,
  key: string,
  definition: string,
): Promise<string> {
  const packageRoot = path.join(sourceRoot, key);
  await fs.mkdir(packageRoot, { recursive: true });
  await fs.writeFile(path.join(packageRoot, 'workflow.ts'), definition);
  return packageRoot;
}

function terminatingWorkflow(title: string): string {
  return [
    `import { defineWorkflow, TerminateInstruction } from ${JSON.stringify(authoringEntry)};`,
    `export default defineWorkflow({`,
    `  title: ${JSON.stringify(title)},`,
    `  nodes: [`,
    `    TerminateInstruction.create({ key: 'done', config: { outcome: 'success' } }),`,
    `  ],`,
    `});`,
    '',
  ].join('\n');
}

async function createService(
  root: string,
  production: boolean,
): Promise<WorkflowService> {
  const database = createDatabaseManager({
    connections: { main: { dialect: 'sqlite', filename: ':memory:' } },
  });
  databases.push(database);
  await database.builder().createCollections(
    workflowCollectionSchemas.map(({ name, define }) => ({
      name,
      definition: define,
    })),
  );
  const queue = createQueueManager(createSyncQueueConfig());
  queues.push(queue);
  const service = new WorkflowService({
    database,
    queue,
    queueName: `workflow:dev-source-${(queueSequence += 1)}`,
    services: new ServiceContainer(),
    sourceRoot: path.join(root, 'server/workflows'),
    distRoot: path.join(root, 'dist/server/workflows'),
    artifactDisk: {
      driver: 'fs',
      location: path.join(root, 'storage/private'),
      visibility: 'private',
    },
    production,
  });
  services.push(service);
  return service;
}

describe('development workflow source discovery', () => {
  it('produces the digest the build would write for the same source', async () => {
    const { root, sourceRoot } = await application();
    await writePackage(sourceRoot, 'sample', terminatingWorkflow('Sample'));
    const distRoot = path.join(root, 'dist/server/workflows');

    await buildApplicationWorkflows({ sourceRoot, distRoot });
    const [built] = await fs.readdir(path.join(distRoot, 'sample'));
    const [loaded] = await loadWorkflowSourcePackages(sourceRoot, {
      instructions: coreInstructions,
    });

    // Identity is what makes this safe: the revision a developer enables in
    // development is the same revision the build produces for production.
    expect(loaded.digest).toBe(built);
    expect(loaded.key).toBe('sample');
    expect(loaded.directory).toBe(
      await fs.realpath(path.join(sourceRoot, 'sample')),
    );
  });

  it('treats a missing source root as an application with no workflows', async () => {
    const { sourceRoot } = await application();

    await expect(
      loadWorkflowSourcePackages(sourceRoot, {
        instructions: coreInstructions,
      }),
    ).resolves.toEqual([]);
  });

  it('reports a semantic issue instead of compiling it', async () => {
    const { sourceRoot } = await application();
    await writePackage(
      sourceRoot,
      'broken',
      [
        `import { defineWorkflow } from ${JSON.stringify(authoringEntry)};`,
        `export default defineWorkflow({`,
        `  title: 'Broken',`,
        `  nodes: [{ key: 'nope', type: 'not-an-instruction', config: {} }],`,
        `});`,
        '',
      ].join('\n'),
    );

    await expect(
      loadWorkflowSourcePackages(sourceRoot, {
        instructions: coreInstructions,
      }),
    ).rejects.toBeInstanceOf(WorkflowSourceCheckError);
  });

  it('validates against instructions a plugin registered at runtime', async () => {
    const { sourceRoot } = await application();
    await writePackage(
      sourceRoot,
      'extended',
      [
        `import { defineWorkflow } from ${JSON.stringify(authoringEntry)};`,
        `export default defineWorkflow({`,
        `  title: 'Extended',`,
        `  nodes: [{ key: 'say', type: 'echo', config: { value: 'hi' } }],`,
        `});`,
        '',
      ].join('\n'),
    );

    await expect(
      loadWorkflowSourcePackages(sourceRoot, {
        instructions: coreInstructions,
      }),
    ).rejects.toBeInstanceOf(WorkflowSourceCheckError);
    await expect(
      loadWorkflowSourcePackages(sourceRoot, {
        instructions: new Map([
          ...coreInstructions,
          [echoInstruction.type, echoInstruction],
        ]),
      }),
    ).resolves.toHaveLength(1);
  });
});

describe('development workflow loading', () => {
  it('discovers source without a build and picks up an edit in the same process', async () => {
    const { root, sourceRoot } = await application();
    await writePackage(sourceRoot, 'sample', terminatingWorkflow('First'));
    const service = await createService(root, false);

    const before = await service.discoverArtifacts();
    expect(before).toHaveLength(1);
    expect(before[0].workflow.title).toBe('First');

    await writePackage(sourceRoot, 'sample', terminatingWorkflow('Second'));

    const after = await service.discoverArtifacts();
    expect(after[0].workflow.title).toBe('Second');
    expect(after[0].digest).not.toBe(before[0].digest);
  });

  it('registers a source revision without copying it into the Artifact store', async () => {
    const { root, sourceRoot } = await application();
    await writePackage(sourceRoot, 'sample', terminatingWorkflow('Sample'));
    const service = await createService(root, false);
    const [artifact] = await service.discoverArtifacts();

    const workflowId = await service.ensureArtifactMaterialized(
      artifact.digest,
    );

    expect(workflowId).toBeDefined();
    const rows = await databases[databases.length - 1]
      .query()
      .selectFrom(WORKFLOW_COLLECTIONS.workflows)
      .selectAll()
      .execute<Row>();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ key: 'sample', hash: artifact.digest });
    // The engine reads run modules from the source package in development, so
    // an Artifact store copy would be a second copy nothing loads.
    await expect(
      fs.readdir(path.join(root, 'storage/private')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('runs a source revision even though the Artifact store is empty', async () => {
    const { root, sourceRoot } = await application();
    await writePackage(sourceRoot, 'sample', terminatingWorkflow('Sample'));
    const service = await createService(root, false);
    const [artifact] = await service.discoverArtifacts();
    await service.ensureArtifactMaterialized(artifact.digest);

    // The precondition for starting a run is that the code is where the engine
    // will look for it. In development that is the source package, so a store
    // lookup would refuse a workflow that is perfectly runnable.
    await expect(
      service.trigger('sample', {}, { manually: true }),
    ).resolves.toMatchObject({ status: 'accepted' });
  });

  it('refuses to run when the source package is gone', async () => {
    const { root, sourceRoot } = await application();
    await writePackage(sourceRoot, 'sample', terminatingWorkflow('Sample'));
    const service = await createService(root, false);
    const [artifact] = await service.discoverArtifacts();
    await service.ensureArtifactMaterialized(artifact.digest);
    await fs.rm(path.join(sourceRoot, 'sample'), { recursive: true });

    await expect(
      service.trigger('sample', {}, { manually: true }),
    ).rejects.toThrow(/Workflow source package sample is missing/);
  });

  it('reads built Artifacts and never the source when production', async () => {
    const { root, sourceRoot } = await application();
    await writePackage(sourceRoot, 'sample', terminatingWorkflow('Source'));
    await buildApplicationWorkflows({
      sourceRoot,
      distRoot: path.join(root, 'dist/server/workflows'),
    });
    await writePackage(sourceRoot, 'sample', terminatingWorkflow('Edited'));
    const service = await createService(root, true);

    const discovered = await service.discoverArtifacts();

    expect(discovered).toHaveLength(1);
    expect(discovered[0].workflow.title).toBe('Source');
    expect(discovered[0].origin).toBe('dist');
  });

  it('prefers source over a stale built Artifact for the same key', async () => {
    const { root, sourceRoot } = await application();
    await writePackage(sourceRoot, 'sample', terminatingWorkflow('Stale'));
    await writePackage(sourceRoot, 'built-only', terminatingWorkflow('Built'));
    await buildApplicationWorkflows({
      sourceRoot,
      distRoot: path.join(root, 'dist/server/workflows'),
    });
    await fs.rm(path.join(sourceRoot, 'built-only'), { recursive: true });
    await writePackage(sourceRoot, 'sample', terminatingWorkflow('Fresh'));
    const service = await createService(root, false);

    const discovered = await service.discoverArtifacts();

    expect(
      discovered.map((artifact) => [
        artifact.key,
        artifact.workflow.title,
        artifact.origin,
      ]),
    ).toEqual([
      ['built-only', 'Built', 'dist'],
      ['sample', 'Fresh', 'source'],
    ]);
  });
});

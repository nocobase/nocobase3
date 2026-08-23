import fs from 'node:fs/promises';
import path from 'node:path';
import type { DatabaseManager, QueryAdapter, Row } from '@nocobase/database';
import type { Knex } from 'knex';
import { WORKFLOW_COLLECTIONS } from '../collections/names.js';
import type { WorkflowFlatIr } from '../workflow-source/core.js';
import type { WorkflowArtifactDefinition } from './artifact-builder.js';
import type { WorkflowArtifactStore } from './artifact-store.js';
import { activateWorkflowSource, materializeWorkflowSource } from './source-materializer.js';
import { validateWorkflowFlatIrTopology } from './source-compiler.js';
import type { WorkflowId } from './types.js';
import { asId, serializeJson } from './utils.js';

export interface WorkflowPublishLock { release(): Promise<void>; }
export interface WorkflowPublisherOptions {
  database: DatabaseManager;
  connectionName?: string;
  artifactStore: WorkflowArtifactStore;
  beforeRegister?: (digest: string) => void | Promise<void>;
  afterMaterialize?: (workflowId: WorkflowId, query: QueryAdapter) => void | Promise<void>;
  onWorkflowUpdated?: (workflowId: WorkflowId) => void | Promise<void>;
}
export interface WorkflowPublishResult { action: 'created' | 'replaced' | 'unchanged'; workflowId: WorkflowId; digest: string; }
export interface WorkflowDistArtifact { key: string; digest: string; directory: string; workflow: WorkflowArtifactDefinition; }
export interface WorkflowDeploymentSyncResult extends WorkflowPublishResult { imported: boolean; }

export class WorkflowPublisher {
  constructor(private readonly options: WorkflowPublisherOptions) {}

  async acquirePublishLock(_key: string): Promise<WorkflowPublishLock> {
    return { release: (): Promise<void> => Promise.resolve() };
  }

  async registerArtifact(artifact: WorkflowDistArtifact): Promise<WorkflowPublishResult> {
    const lock = await this.acquirePublishLock(artifact.key);
    try {
      await this.options.beforeRegister?.(artifact.digest);
      return await this.register(artifact);
    } finally { await lock.release(); }
  }

  async activate(workflowId: WorkflowId): Promise<void> {
    await this.options.database.transaction((connection) => activateWorkflowSource(connection.query, workflowId), this.options.connectionName);
    await this.options.onWorkflowUpdated?.(workflowId);
  }

  private async register(artifact: WorkflowDistArtifact): Promise<WorkflowPublishResult> {
    const built = artifact.workflow;
    return this.options.database.transaction(async (connection): Promise<WorkflowPublishResult> => {
      const knex = await connection.client<Knex>();
      await knex('workflows').where({ key: artifact.key }).forUpdate().select('id');
      const revisions = await connection.query.selectFrom(WORKFLOW_COLLECTIONS.workflows).selectAll().where('key', '=', artifact.key).orderBy('id', 'desc').execute<Row>();
      const same = revisions.find((row) => row.hash === artifact.digest);
      if (same) return { action: 'unchanged', workflowId: asId(same.id), digest: artifact.digest };
      const target = revisions.find((row) => Boolean(row.current)) ?? revisions[0];
      if (target) {
        const referenced = await connection.query.selectFrom(WORKFLOW_COLLECTIONS.runs).where('workflowId', '=', asId(target.id)).exists();
        if (!referenced) {
          const workflowId = asId(target.id);
          await connection.query.updateTable(WORKFLOW_COLLECTIONS.workflows).set({ hash: artifact.digest, title: built.title, description: built.description ?? null, contextSchema: serializeJson(built.contextSchema), options: serializeJson(built.options ?? {}), inputSchema: serializeJson(built.inputs ?? {}) }).where('id', '=', workflowId).execute();
          await connection.query.deleteFrom(WORKFLOW_COLLECTIONS.nodes).where('workflowId', '=', workflowId).execute();
          await this.insertNodes(connection.query, workflowId, built);
          await this.options.afterMaterialize?.(workflowId, connection.query);
          await this.validateMaterialization(connection.query, workflowId, built);
          return { action: 'replaced', workflowId, digest: artifact.digest };
        }
      }
      const materialized = await materializeWorkflowSource({ key: artifact.key, hash: artifact.digest, filePath: artifact.directory, ir: built }, connection.query);
      await this.options.afterMaterialize?.(materialized.workflowId, connection.query);
      await this.validateMaterialization(connection.query, materialized.workflowId, built);
      return { action: 'created', workflowId: materialized.workflowId, digest: artifact.digest };
    }, this.options.connectionName);
  }

  private async insertNodes(query: QueryAdapter, workflowId: WorkflowId, built: WorkflowFlatIr): Promise<void> {
    if (built.nodes.length === 0) return;
    await query.insertInto(WORKFLOW_COLLECTIONS.nodes).values(built.nodes.map((node) => ({ workflowId, key: node.key, title: node.title ?? null, description: node.description ?? null, type: node.type, config: serializeJson(node.config), upstreamKey: node.upstreamKey, downstreamKey: node.downstreamKey, branchKey: node.branchKey }))).execute();
  }

  private async validateMaterialization(query: QueryAdapter, workflowId: WorkflowId, expected: WorkflowFlatIr): Promise<void> {
    const rows = await query.selectFrom(WORKFLOW_COLLECTIONS.nodes).select(['key', 'title', 'type', 'config', 'upstreamKey', 'downstreamKey', 'branchKey']).where('workflowId', '=', workflowId).orderBy('id').execute<Row>();
    if (rows.length !== expected.nodes.length) throw new Error(`Materialized workflow ${String(workflowId)} node count mismatch`);
    const nodes = rows.map((row) => ({ key: String(row.key), ...(row.title == null ? {} : { title: String(row.title) }), type: String(row.type), config: typeof row.config === 'string' ? JSON.parse(row.config) as import('./types.js').JsonObject : row.config as import('./types.js').JsonObject, upstreamKey: row.upstreamKey == null ? null : String(row.upstreamKey), downstreamKey: row.downstreamKey == null ? null : String(row.downstreamKey), branchKey: row.branchKey == null ? null : String(row.branchKey) }));
    if (nodes.some((node, index) => node.key !== expected.nodes[index]?.key)) throw new Error(`Materialized workflow ${String(workflowId)} node key mismatch`);
    validateWorkflowFlatIrTopology({ ...expected, nodes });
  }
}

export async function discoverWorkflowDistArtifacts(distRoot: string): Promise<readonly WorkflowDistArtifact[]> {
  let keyEntries: import('node:fs').Dirent[];
  try { keyEntries = await fs.readdir(distRoot, { withFileTypes: true }); }
  catch (error) { throw new Error(`Workflow dist Artifact root "${distRoot}" cannot be read: ${error instanceof Error ? error.message : String(error)}`); }
  const artifacts: WorkflowDistArtifact[] = [];
  for (const keyEntry of keyEntries.filter((entry) => entry.isDirectory()).sort((left, right) => left.name.localeCompare(right.name))) {
    const keyRoot = path.join(distRoot, keyEntry.name);
    const digestEntries = (await fs.readdir(keyRoot, { withFileTypes: true })).filter((entry) => entry.isDirectory() && !entry.name.includes('.tmp-'));
    if (digestEntries.length !== 1) throw new Error(`Workflow "${keyEntry.name}" at "${keyRoot}" must contain exactly one digest directory; found ${digestEntries.length}`);
    const digest = digestEntries[0].name;
    const directory = path.join(keyRoot, digest);
    let workflow: WorkflowArtifactDefinition;
    try { workflow = JSON.parse(await fs.readFile(path.join(directory, 'workflow.json'), 'utf8')) as WorkflowArtifactDefinition; }
    catch (error) { throw new Error(`Workflow "${keyEntry.name}" Artifact at "${directory}" has no readable workflow.json: ${error instanceof Error ? error.message : String(error)}`); }
    artifacts.push({ key: keyEntry.name, digest, directory, workflow });
  }
  return artifacts;
}

export async function syncWorkflowDeployment(distRoot: string, publisher: WorkflowPublisher, store: WorkflowArtifactStore): Promise<readonly WorkflowDeploymentSyncResult[]> {
  const artifacts = await discoverWorkflowDistArtifacts(distRoot);
  const results: WorkflowDeploymentSyncResult[] = [];
  for (const artifact of artifacts) {
    let imported = false;
    try {
      imported = !await store.has(artifact.key, artifact.digest);
      await store.commit(artifact.key, artifact.digest, artifact.directory);
      const result = await publisher.registerArtifact(artifact);
      await publisher.activate(result.workflowId);
      results.push({ ...result, imported });
    } catch (error) { throw new Error(`Workflow "${artifact.key}" Artifact at "${artifact.directory}" failed startup synchronization: ${error instanceof Error ? error.message : String(error)}`, { cause: error }); }
  }
  return results;
}

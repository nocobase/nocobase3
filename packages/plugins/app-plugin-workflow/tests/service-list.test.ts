import type { DatabaseManager } from '@nocobase/db';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WorkflowRepository } from '../server/repositories/workflow-repository.js';
import { WorkflowRunRepository } from '../server/repositories/workflow-run-repository.js';
import type { WorkflowServiceApi } from '../server/service.js';
import type { WorkflowDistArtifact } from '../server/loader/index.js';
import {
  createTestDatabase,
  createTestWorkflow,
  insertTestRun,
} from './helpers.js';
import { WORKFLOW_COLLECTIONS } from '../server/collections/names.js';
import { parseWorkflowIdentifier } from '../server/repositories/mappers.js';

describe('workflow repositories', () => {
  let database: DatabaseManager;
  let workflows: WorkflowRepository;
  let workflowRuns: WorkflowRunRepository;

  beforeEach(async () => {
    database = await createTestDatabase();
    const service: WorkflowServiceApi = {
      trigger: async () => ({ status: 'accepted', eventKey: 'test-event' }),
      triggerRevision: async () => ({
        status: 'accepted',
        eventKey: 'test-event',
      }),
      discoverArtifacts: async () => [],
      ensureArtifactMaterialized: async () => undefined,
    };
    workflows = new WorkflowRepository(database, service);
    workflowRuns = new WorkflowRunRepository(database, service);
  });

  afterEach(async () => {
    await database.destroy();
  });

  it('filters and paginates workflows in the database query', async () => {
    await createTestWorkflow(database, {
      key: 'leave-approval',
      enabled: true,
      nodes: [],
    });
    await createTestWorkflow(database, {
      key: 'expense-approval',
      enabled: false,
      nodes: [],
    });

    const page = await workflows.list({
      query: 'approval',
      enabled: false,
      page: 1,
      pageSize: 1,
    });

    expect(page).toMatchObject({ page: 1, pageSize: 1, total: 1 });
    expect(page.data.map((item) => item.key)).toEqual(['expense-approval']);
  });

  it('loads run summaries only for the requested workflow page', async () => {
    const older = await createTestWorkflow(database, {
      key: 'older-workflow',
      nodes: [],
    });
    const newer = await createTestWorkflow(database, {
      key: 'newer-workflow',
      nodes: [],
    });
    await insertTestRun(database, {
      workflowId: older.id,
      workflowKey: older.key,
      eventKey: 'older-active',
      status: 0,
    });
    await insertTestRun(database, {
      workflowId: newer.id,
      workflowKey: newer.key,
      eventKey: 'newer-completed',
      status: 1,
    });
    await insertTestRun(database, {
      workflowId: newer.id,
      workflowKey: newer.key,
      eventKey: 'newer-active',
      status: null,
    });

    const page = await workflows.list({ page: 1, pageSize: 1 });

    expect(page).toMatchObject({ page: 1, pageSize: 1, total: 2 });
    expect(page.data).toEqual([
      expect.objectContaining({
        key: 'newer-workflow',
        activeRunCount: 1,
        latestRun: expect.objectContaining({ status: null }),
      }),
    ]);
  });

  it('loads detail execution counts from workflow stats without run details', async () => {
    const workflow = await createTestWorkflow(database, {
      key: 'detail-stats',
      nodes: [],
    });
    await database
      .query()
      .insertInto(WORKFLOW_COLLECTIONS.stats)
      .values({ key: workflow.key, executed: 7 })
      .execute();
    await insertTestRun(database, {
      workflowId: workflow.id,
      workflowKey: workflow.key,
      eventKey: 'latest-run',
      status: 1,
    });

    await expect(workflows.get(workflow.id)).resolves.toMatchObject({
      executed: 7,
      latestRun: null,
    });
  });

  it('classifies workflow ids and Artifact hashes before repository queries', async () => {
    const hash = 'A'.repeat(64);
    expect(parseWorkflowIdentifier('42')).toEqual({ kind: 'id', value: '42' });
    expect(parseWorkflowIdentifier(hash)).toEqual({
      kind: 'hash',
      value: hash.toLowerCase(),
    });
    expect(parseWorkflowIdentifier('1'.repeat(64))).toEqual({
      kind: 'hash',
      value: '1'.repeat(64),
    });

    const ensureArtifactMaterialized = vi.fn(async () => undefined);
    const repository = new WorkflowRepository(database, {
      trigger: async () => ({ status: 'accepted', eventKey: 'test-event' }),
      triggerRevision: async () => ({
        status: 'accepted',
        eventKey: 'test-event',
      }),
      refreshSourceResolvers: async (): Promise<void> => undefined,
      discoverArtifacts: async () => [],
      ensureArtifactMaterialized,
    });

    for (const identifier of [
      'artifact-hash',
      '0',
      '-1',
      '1.5',
      '9223372036854775808',
      'g'.repeat(64),
    ]) {
      await expect(repository.enable(identifier)).rejects.toThrow(
        /positive integer id or a 64-character hexadecimal Artifact hash/,
      );
    }
    expect(ensureArtifactMaterialized).not.toHaveBeenCalled();

    await expect(repository.enable('42')).rejects.toThrow(
      /Workflow id or hash 42 was not found/,
    );
    expect(ensureArtifactMaterialized).not.toHaveBeenCalled();

    await expect(repository.enable(hash)).rejects.toThrow(
      new RegExp(`Workflow id or hash ${hash} was not found`),
    );
    expect(ensureArtifactMaterialized).toHaveBeenCalledExactlyOnceWith(
      hash.toLowerCase(),
    );
  });

  it('paginates matching undeployed artifacts after database workflows', async () => {
    await createTestWorkflow(database, { key: 'database-workflow', nodes: [] });
    const artifacts: WorkflowDistArtifact[] = [
      createArtifact('artifact-one'),
      createArtifact('artifact-two'),
    ];
    const service: WorkflowServiceApi = {
      trigger: async () => ({ status: 'accepted', eventKey: 'test-event' }),
      triggerRevision: async () => ({
        status: 'accepted',
        eventKey: 'test-event',
      }),
      discoverArtifacts: async () => artifacts,
      ensureArtifactMaterialized: async () => undefined,
    };
    workflows = new WorkflowRepository(database, service);

    const page = await workflows.list({ page: 2, pageSize: 1 });

    expect(page).toMatchObject({ page: 2, pageSize: 1, total: 3 });
    expect(page.data.map((item) => item.key)).toEqual(['artifact-one']);
  });

  it('filters executions before applying pagination', async () => {
    const leave = await createTestWorkflow(database, {
      key: 'leave-approval',
      nodes: [],
    });
    const expense = await createTestWorkflow(database, {
      key: 'expense-report',
      nodes: [],
    });
    await insertTestRun(database, {
      workflowId: leave.id,
      workflowKey: leave.key,
      eventKey: 'leave-failed',
      status: -1,
    });
    await insertTestRun(database, {
      workflowId: leave.id,
      workflowKey: leave.key,
      eventKey: 'leave-resolved',
      status: 1,
    });
    await insertTestRun(database, {
      workflowId: expense.id,
      workflowKey: expense.key,
      eventKey: 'expense-failed',
      status: -1,
    });

    const page = await workflowRuns.list({
      workflowTitle: 'leave',
      status: -1,
      page: 1,
      pageSize: 1,
    });

    expect(page).toMatchObject({ page: 1, pageSize: 1, total: 1 });
    expect(page.data.map((item) => item.eventKey)).toEqual(['leave-failed']);
  });

  it('loads the materialized workflow title and version with run details', async () => {
    const workflow = await createTestWorkflow(database, {
      key: 'versioned-run',
      nodes: [],
    });
    await database
      .query()
      .updateTable(WORKFLOW_COLLECTIONS.workflows)
      .set({ title: 'Versioned run', version: 'version-3' })
      .where('id', '=', workflow.id)
      .execute();
    const run = await insertTestRun(database, {
      workflowId: workflow.id,
      workflowKey: workflow.key,
      eventKey: 'versioned-run-detail',
      status: 1,
    });

    await expect(workflowRuns.get(run)).resolves.toMatchObject({
      workflowTitle: 'Versioned run',
      workflowVersion: 'version-3',
    });
  });

  it('keeps enabled exclusive to the current revision', async () => {
    const first = await createTestWorkflow(database, {
      key: 'versioned',
      enabled: true,
      nodes: [],
    });
    await database
      .query()
      .updateTable(WORKFLOW_COLLECTIONS.workflows)
      .set({ current: null })
      .where('id', '=', first.id)
      .execute();
    await database
      .query()
      .insertInto(WORKFLOW_COLLECTIONS.workflows)
      .values({
        key: 'versioned',
        title: 'versioned v2',
        enabled: false,
        current: true,
        inputSchema: JSON.stringify({ type: 'object' }),
        parametersSchema: JSON.stringify({}),
        parameterValues: JSON.stringify({}),
        options: JSON.stringify({}),
      })
      .execute();
    const second = await database
      .query()
      .selectFrom(WORKFLOW_COLLECTIONS.workflows)
      .where('key', '=', 'versioned')
      .where('current', '=', true)
      .executeTakeFirstOrThrow();

    await workflows.setStatus(second.id, true);

    const revisions = await database
      .query()
      .selectFrom(WORKFLOW_COLLECTIONS.workflows)
      .select(['id', 'current', 'enabled'])
      .where('key', '=', 'versioned')
      .orderBy('id')
      .execute();
    expect(revisions).toEqual([
      expect.objectContaining({ id: first.id, current: null, enabled: 0 }),
      expect.objectContaining({ id: second.id, current: 1, enabled: 1 }),
    ]);
  });
});

function createArtifact(key: string): WorkflowDistArtifact {
  return {
    key,
    digest: key.padEnd(64, '0'),
    directory: `/tmp/${key}`,
    workflow: {
      formatVersion: 1,
      key,
      inputSchema: { type: 'object' },
      parameters: {},
      nodes: [],
    },
  };
}

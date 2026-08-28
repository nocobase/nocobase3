import type { DatabaseManager } from '@nocobase/app-database';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { WorkflowRepository } from '../server/services/workflow-repository.js';
import { WorkflowRunRepository } from '../server/services/workflow-run-repository.js';
import type { WorkflowServiceApi } from '../server/runtime/runtime.js';
import type { WorkflowDistArtifact } from '../server/loader/index.js';
import {
  createTestDatabase,
  createTestWorkflow,
  insertTestRun,
} from './helpers.js';
import { WORKFLOW_COLLECTIONS } from '../server/collections/names.js';

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
      refreshSourceResolvers: async (): Promise<void> => undefined,
      discoverArtifacts: async () => [],
      publishArtifact: async (): Promise<void> => undefined,
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
      refreshSourceResolvers: async (): Promise<void> => undefined,
      discoverArtifacts: async () => artifacts,
      publishArtifact: async (): Promise<void> => undefined,
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

import type { DatabaseManager } from '@nocobase/app-database';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { WorkflowRepository } from '../server/services/workflow-repository.js';
import { WorkflowRunRepository } from '../server/services/workflow-run-repository.js';
import type { AppWorkflowRuntime } from '../server/runtime/runtime.js';
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
    const runtime: AppWorkflowRuntime = {
      trigger: async () => ({ status: 'accepted', eventKey: 'test-event' }),
      refreshSourceResolvers: async (): Promise<void> => undefined,
      discoverArtifacts: async () => [],
      publishArtifact: async (): Promise<void> => undefined,
    };
    workflows = new WorkflowRepository(database, runtime);
    workflowRuns = new WorkflowRunRepository(database, runtime);
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
        contextSchema: JSON.stringify({ type: 'object' }),
        inputSchema: JSON.stringify({}),
        inputValues: JSON.stringify({}),
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

import type { DatabaseManager } from '@nocobase/database';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DatabaseWorkflowService } from '../server/services/workflow.js';
import type { AppWorkflowRuntime } from '../server/workflows/runtime.js';
import {
  createTestDatabase,
  createTestWorkflow,
  insertTestRun,
} from './helpers.js';

describe('DatabaseWorkflowService lists', () => {
  let database: DatabaseManager;
  let service: DatabaseWorkflowService;

  beforeEach(async () => {
    database = await createTestDatabase();
    const runtime: AppWorkflowRuntime = {
      start: async (): Promise<void> => undefined,
      stop: async (): Promise<void> => undefined,
      refreshSourceResolvers: async (): Promise<void> => undefined,
      discoverArtifacts: async () => [],
      publishArtifact: async (): Promise<void> => undefined,
    };
    service = new DatabaseWorkflowService(database, runtime);
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

    const page = await service.list({
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

    const page = await service.runs({
      workflowTitle: 'leave',
      status: -1,
      page: 1,
      pageSize: 1,
    });

    expect(page).toMatchObject({ page: 1, pageSize: 1, total: 1 });
    expect(page.data.map((item) => item.eventKey)).toEqual(['leave-failed']);
  });
});

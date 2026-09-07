import { describe, expect, it, vi } from 'vitest';
import { auditDialects, auditFixture } from './audit-fixture.js';
import { createTestWorkflow, readRun } from './helpers.js';
import WorkflowEngine from '../server/engine/engine.js';
import {
  EXECUTION_STATUS,
  NODE_RUN_STATUS,
} from '../server/engine/constants.js';
import {
  defineTestInstruction,
  pendingInstruction,
} from './fixtures/instructions.js';
import type { WorkflowQueueTask } from '../server/engine/types.js';
import Dispatcher from '../server/engine/dispatcher.js';
import Processor from '../server/engine/processor.js';
import { loadRun } from '../server/engine/utils.js';
import { WorkflowAuditWriteError } from '../server/audit-internal.js';

for (const dialect of auditDialects)
  describe(`workflow audit ${dialect}`, () => {
    it('automatically records stages and deduplicates terminal delivery without copying workflow secrets', async () => {
      const f = await auditFixture(dialect);
      const tasks: WorkflowQueueTask[] = [];
      const workflow = await createTestWorkflow(f.database, {
        key: 'automatic',
        nodes: [],
      });
      const dispatcher = new Dispatcher({
        database: f.database,
        instructions: new Map(),
        queue: {
          publish: async (task) => {
            tasks.push(task);
          },
        },
      });
      try {
        await f.runtime.runRequest(() =>
          f.runtime.runAuthenticated(
            { actor: { type: 'user', id: 'human' } },
            () =>
              f.runtime.runChild(
                { actor: { type: 'agent', id: 'agent' } },
                () =>
                  dispatcher.trigger(workflow, {
                    apiKey: 'G17_SECRET_SENTINEL',
                  }),
              ),
          ),
        );
        expect(tasks).toHaveLength(1);
        await dispatcher.dispatch(tasks[0]);
        await dispatcher.dispatch(tasks[0]);
        const events = await f.events();
        expect(events.map((e) => e.action).sort()).toEqual([
          'workflow.accepted',
          'workflow.completed',
          'workflow.started',
        ]);
        expect(
          events.every(
            (e) => e.actor.type === 'workflow' && e.initiator?.id === 'human',
          ),
        ).toBe(true);
        expect(new Set(events.map((e) => e.operationId)).size).toBe(1);
        expect(
          events.every((e) => e.runId === String(tasks[0].executionId)),
        ).toBe(true);
        expect(JSON.stringify(events)).not.toContain('G17_SECRET_SENTINEL');
        expect((await readRun(f.database, tasks[0].executionId)).status).toBe(
          EXECUTION_STATUS.RESOLVED,
        );
      } finally {
        await f.dispose();
      }
    });

    it('rolls back terminal state with an audit append failure and never fabricates a failed business completion', async () => {
      const f = await auditFixture(dialect);
      const runtime = new WorkflowEngine({
        database: f.database,
        timeoutReaper: false,
      });
      runtime.registerInstruction(pendingInstruction);
      try {
        const workflow = await createTestWorkflow(f.database, {
          key: 'rollback',
          nodes: [{ key: 'wait', type: 'pending' }],
        });
        const processor = await runtime.trigger(workflow, {});
        expect(processor).toBeNull();
        const row = await f.database
          .query()
          .selectFrom('workflowRuns')
          .selectAll()
          .executeTakeFirstOrThrow();
        const execution = await loadRun(f.database.query(), String(row.id));
        if (!execution) throw new Error('Run missing');
        const p = new Processor({
          database: f.database,
          workflow,
          execution,
          instructions: new Map(),
          workflowResourceRoot: null,
        });
        const client = await f.connection.client<import('knex').Knex>();
        await client.schema.renameTable(
          'auditEvents',
          'g17_unavailable_events',
        );
        await expect(p.exit(NODE_RUN_STATUS.RESOLVED)).rejects.toBeInstanceOf(
          WorkflowAuditWriteError,
        );
        expect((await readRun(f.database, execution.id)).status).toBe(
          EXECUTION_STATUS.STARTED,
        );
        expect(execution.status).toBe(EXECUTION_STATUS.STARTED);
        await client.schema.renameTable(
          'g17_unavailable_events',
          'auditEvents',
        );
        expect(
          (await f.events()).some((e) => e.action === 'workflow.completed'),
        ).toBe(false);
        await p.exit(NODE_RUN_STATUS.RESOLVED);
        expect(
          (await f.events()).filter((e) => e.action === 'workflow.completed'),
        ).toHaveLength(1);
      } finally {
        await runtime.dispose();
        await f.dispose();
      }
    });

    it('keeps workflow behavior without audit and records real worker exceptions as failed terminal facts', async () => {
      const f = await auditFixture(dialect);
      const runtime = new WorkflowEngine({
        database: f.database,
        timeoutReaper: false,
      });
      runtime.registerInstruction(
        defineTestInstruction('throws', async () => {
          throw new Error('G17_EXCEPTION_SECRET');
        }),
      );
      try {
        const workflow = await createTestWorkflow(f.database, {
          key: 'errors',
          nodes: [{ key: 'fail', type: 'throws' }],
        });
        await runtime.trigger(workflow, {});
        expect(
          (await f.events()).filter((e) => e.action === 'workflow.failed'),
        ).toHaveLength(1);
        expect(JSON.stringify(await f.events())).not.toContain(
          'G17_EXCEPTION_SECRET',
        );
        f.disable();
        await runtime.trigger(workflow, {});
        expect(
          (await f.events()).filter((e) => e.action === 'workflow.failed'),
        ).toHaveLength(1);
      } finally {
        await runtime.dispose();
        await f.dispose();
      }
    });

    it('preserves the original initiator on human resume and records distinct rerun attempts', async () => {
      const f = await auditFixture(dialect);
      const runtime = new WorkflowEngine({
        database: f.database,
        timeoutReaper: false,
      });
      runtime.registerInstruction(pendingInstruction);
      try {
        const workflow = await createTestWorkflow(f.database, {
          key: 'human-resume',
          nodes: [{ key: 'wait', type: 'pending' }],
        });
        await f.runtime.runRequest(() =>
          f.runtime.runAuthenticated(
            { actor: { type: 'user', id: 'initiator' } },
            () =>
              f.runtime.runChild(
                { actor: { type: 'agent', id: 'agent' } },
                () => runtime.trigger(workflow, {}),
              ),
          ),
        );
        const run = await f.database
          .query()
          .selectFrom('workflowRuns')
          .selectAll()
          .executeTakeFirstOrThrow();
        await runtime.dispatch({
          executionId: String(run.id),
          rerun: { nodeKey: 'wait' },
          attemptId: 'attempt-two',
        });
        await runtime.dispatch({
          executionId: String(run.id),
          rerun: { nodeKey: 'wait' },
          attemptId: 'attempt-two',
        });
        await runtime.dispatch({
          executionId: String(run.id),
          rerun: { nodeKey: 'wait' },
          attemptId: 'attempt-three',
        });
        const retried = (await f.events()).filter(
          (event) => event.action === 'workflow.retried',
        );
        expect(retried).toHaveLength(2);
        expect(retried.map((event) => event.details?.attempt).sort()).toEqual([
          'attempt-three',
          'attempt-two',
        ]);
        const node = await f.database
          .query()
          .selectFrom('workflowNodeRuns')
          .selectAll()
          .orderBy('id', 'desc')
          .executeTakeFirstOrThrow();
        await f.runtime.runAuthenticated(
          {
            actor: { type: 'user', id: 'approver' },
            roleIds: ['approver-role'],
          },
          () =>
            runtime.resume(String(run.id), String(node.id), {
              password: 'G17_RESUME_SECRET',
            }),
        );
        const events = await f.events();
        const resumed = events.find(
          (event) => event.action === 'workflow.resumed',
        );
        expect(resumed?.actor).toEqual({ type: 'user', id: 'approver' });
        expect(resumed?.roleIds).toEqual(['approver-role']);
        expect(
          events
            .filter((event) => event.actor.type === 'workflow')
            .every((event) => event.roleIds === undefined),
        ).toBe(true);
        expect(resumed?.initiator).toEqual({ type: 'user', id: 'initiator' });
        expect(
          events.find((event) => event.action === 'workflow.completed')
            ?.initiator?.id,
        ).toBe('initiator');
        expect(JSON.stringify(events)).not.toContain('G17_RESUME_SECRET');
      } finally {
        await runtime.dispose();
        await f.dispose();
      }
    });

    it('recovers an unpublished run and audits timeout reclamation once', async () => {
      const f = await auditFixture(dialect);
      const runtime = new WorkflowEngine({ database: f.database });
      runtime.registerInstruction(pendingInstruction);
      const dispatcher = new Dispatcher({
        database: f.database,
        instructions: runtime.instructions,
        queue: {
          publish: async () => {
            throw new Error('Synthetic publish unavailable');
          },
        },
      });
      try {
        const workflow = await createTestWorkflow(f.database, {
          key: 'recover',
          nodes: [{ key: 'wait', type: 'pending' }],
        });
        await f.runtime.runAuthenticated(
          { actor: { type: 'user', id: 'original' } },
          async () => {
            await expect(dispatcher.trigger(workflow, {})).rejects.toThrow(
              'Synthetic publish unavailable',
            );
          },
        );
        await expect(runtime.dispatcher.recover()).resolves.toBe(1);
        const row = await f.database
          .query()
          .selectFrom('workflowRuns')
          .selectAll()
          .executeTakeFirstOrThrow();
        const client = await f.connection.client<import('knex').Knex>();
        await client('workflow_runs')
          .where('id', row.id)
          .update({
            expires_at:
              dialect === 'mysql'
                ? new Date('2001-01-01T00:00:00Z')
                : '2001-01-01T00:00:00Z',
          });
        expect(await runtime.sweepTimeouts()).toBe(1);
        expect(await runtime.sweepTimeouts()).toBe(0);
        const cancelled = (await f.events()).filter(
          (event) => event.action === 'workflow.cancelled',
        );
        expect(cancelled).toHaveLength(1);
        expect(cancelled[0].outcome).toBe('failed');
        expect(cancelled[0].initiator?.id).toBe('original');
        expect((await readRun(f.database, String(row.id))).status).toBe(
          EXECUTION_STATUS.ABORTED,
        );
      } finally {
        await runtime.dispose();
        await f.dispose();
      }
    });

    it('retries only finalization once and never repeats a node side effect', async () => {
      const f = await auditFixture(dialect);
      const runtime = new WorkflowEngine({
        database: f.database,
        timeoutReaper: false,
      });
      let effects = 0;
      runtime.registerInstruction(
        defineTestInstruction('effect', async () => {
          effects += 1;
          return { status: NODE_RUN_STATUS.RESOLVED };
        }),
      );
      const append = f.store.appendWithLimits.bind(f.store);
      let failures = 0;
      const fault = vi
        .spyOn(f.store, 'appendWithLimits')
        .mockImplementation(async (event, options, limits) => {
          if (event.action === 'workflow.completed' && failures++ === 0)
            throw new Error('Synthetic transient audit failure');
          return append(event, options, limits);
        });
      try {
        const workflow = await createTestWorkflow(f.database, {
          key: 'once',
          nodes: [{ key: 'effect', type: 'effect' }],
        });
        await runtime.trigger(workflow, {});
        const run = await f.database
          .query()
          .selectFrom('workflowRuns')
          .selectAll()
          .executeTakeFirstOrThrow();
        await runtime.dispatch({ executionId: String(run.id) });
        expect(effects).toBe(1);
        expect(failures).toBe(2);
        expect(
          (await f.events()).filter(
            (event) => event.action === 'workflow.completed',
          ),
        ).toHaveLength(1);
      } finally {
        fault.mockRestore();
        await runtime.dispose();
        await f.dispose();
      }
    });

    it('propagates exhausted finalization failures without replay and only reclaims via a fresh timeout reaper', async () => {
      const f = await auditFixture(dialect);
      const runtime = new WorkflowEngine({
        database: f.database,
        timeoutReaper: false,
      });
      let effects = 0;
      runtime.registerInstruction(
        defineTestInstruction('persistent-effect', async () => {
          effects += 1;
          return { status: NODE_RUN_STATUS.RESOLVED };
        }),
      );
      const append = f.store.appendWithLimits.bind(f.store);
      let failures = 0;
      const fault = vi
        .spyOn(f.store, 'appendWithLimits')
        .mockImplementation(async (event, options, limits) => {
          if (
            event.action === 'workflow.completed' ||
            event.action === 'workflow.cancelled'
          ) {
            failures += 1;
            throw new Error('Synthetic unavailable audit');
          }
          return append(event, options, limits);
        });
      const restored = new WorkflowEngine({ database: f.database });
      try {
        const workflow = await createTestWorkflow(f.database, {
          key: 'exhausted',
          nodes: [{ key: 'effect', type: 'persistent-effect' }],
        });
        await expect(runtime.trigger(workflow, {})).rejects.toBeInstanceOf(
          WorkflowAuditWriteError,
        );
        const row = await f.database
          .query()
          .selectFrom('workflowRuns')
          .selectAll()
          .executeTakeFirstOrThrow();
        expect(row.status).toBe(EXECUTION_STATUS.STARTED);
        expect(failures).toBe(2);
        await runtime.dispatch({ executionId: String(row.id) });
        expect(effects).toBe(1);
        await runtime.dispose();
        const client = await f.connection.client<import('knex').Knex>();
        await client('workflow_runs')
          .where('id', row.id)
          .update({
            expires_at:
              dialect === 'mysql'
                ? new Date('2001-01-01T00:00:00Z')
                : '2001-01-01T00:00:00Z',
          });
        await expect(restored.sweepTimeouts()).rejects.toBeInstanceOf(
          WorkflowAuditWriteError,
        );
        expect((await readRun(f.database, String(row.id))).status).toBe(
          EXECUTION_STATUS.STARTED,
        );
        expect(
          (await f.events()).some(
            (event) =>
              event.action === 'workflow.cancelled' ||
              event.action === 'workflow.completed',
          ),
        ).toBe(false);
        fault.mockRestore();
        expect(await restored.sweepTimeouts()).toBe(1);
        expect(
          (await f.events()).filter(
            (event) => event.action === 'workflow.cancelled',
          ),
        ).toHaveLength(1);
        expect(
          (await f.events()).some(
            (event) => event.action === 'workflow.completed',
          ),
        ).toBe(false);
        expect(effects).toBe(1);
      } finally {
        fault.mockRestore();
        await runtime.dispose();
        await restored.dispose();
        await f.dispose();
      }
    });

    it('does not inherit a recovery caller identity for a legacy run created without audit', async () => {
      const f = await auditFixture(dialect);
      const runtime = new WorkflowEngine({
        database: f.database,
        timeoutReaper: false,
      });
      try {
        const workflow = await createTestWorkflow(f.database, {
          key: 'legacy-scope',
          nodes: [],
        });
        const created = await f.database
          .query()
          .insertInto('workflowRuns')
          .values({
            workflowId: workflow.id,
            workflowKey: workflow.key,
            eventKey: 'legacy-run',
            input: '{}',
            parameters: '{}',
            auditContext: 'null',
            createdAt:
              dialect === 'mysql' ? new Date() : new Date().toISOString(),
            dispatched: false,
            status: null,
          })
          .execute();
        void created;
        await f.runtime.runAuthenticated(
          { actor: { type: 'user', id: 'unrelated-recovery-user' } },
          () => runtime.dispatcher.recover(),
        );
        const events = await f.events();
        expect(
          events.find((event) => event.action === 'workflow.completed'),
        ).toBeDefined();
        expect(events.every((event) => event.initiator === undefined)).toBe(
          true,
        );
        expect(JSON.stringify(events)).not.toContain('unrelated-recovery-user');
      } finally {
        await runtime.dispose();
        await f.dispose();
      }
    });
  });

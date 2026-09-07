import { describe, it, expect } from 'vitest';
import { auditFixture, auditDialects } from './audit-fixture.js';
import { createTestWorkflow } from './helpers.js';
import { defineTestInstruction } from './fixtures/instructions.js';
import WorkflowEngine from '../server/engine/engine.js';
import { NODE_RUN_STATUS } from '../server/engine/constants.js';
for (const dialect of auditDialects)
  describe(`workflow execution attempt isolation ${dialect}`, () => {
    it.each(['waiting', 'completed'] as const)(
      'does not relabel an in-flight rerun %s with a later queued attempt',
      async (phase) => {
        const f = await auditFixture(dialect);
        const engine = new WorkflowEngine({
          database: f.database,
          timeoutReaper: false,
        });
        let release!: () => void;
        let entered!: () => void;
        const gate = new Promise<void>((r) => {
          release = r;
        });
        const started = new Promise<void>((r) => {
          entered = r;
        });
        let calls = 0;
        engine.registerInstruction(
          defineTestInstruction('g17-independent-wait', async () => {
            calls += 1;
            if (calls === 2) {
              entered();
              await gate;
            }
            return {
              status:
                calls === 2 && phase === 'completed'
                  ? NODE_RUN_STATUS.RESOLVED
                  : NODE_RUN_STATUS.PENDING,
            };
          }),
        );
        let first: Promise<unknown> | undefined;
        let second: Promise<unknown> | undefined;
        try {
          const workflow = await createTestWorkflow(f.database, {
            key: 'g17-independent-attempt',
            nodes: [{ key: 'wait', type: 'g17-independent-wait' }],
          });
          await engine.trigger(workflow, {});
          const row = await f.database
            .query()
            .selectFrom('workflowRuns')
            .selectAll()
            .executeTakeFirstOrThrow();
          first = engine.dispatch({
            executionId: String(row.id),
            rerun: { nodeKey: 'wait' },
            attemptId: 'independent-A',
          });
          await started;
          second = engine.dispatch({
            executionId: String(row.id),
            rerun: { nodeKey: 'wait' },
            attemptId: 'independent-B',
          });
          for (let i = 0; i < 200; i++) {
            const events = await f.events();
            if (
              events.some(
                (e) =>
                  e.action === 'workflow.retried' &&
                  e.details?.attempt === 'independent-B',
              )
            )
              break;
            await new Promise((r) => setTimeout(r, 5));
          }
          release();
          await Promise.all([first, second]);
          const phases = (await f.events()).map((e) => ({
            action: e.action,
            attempt: e.details?.attempt,
          }));

          expect(phases).toContainEqual({
            action: `workflow.${phase}`,
            attempt: 'independent-A',
          });
          if (phase === 'waiting')
            expect(phases).toContainEqual({
              action: 'workflow.waiting',
              attempt: 'independent-B',
            });
        } finally {
          release();
          await Promise.allSettled([first, second]);
          await engine.dispose();
          await f.dispose();
        }
      },
    );

    it.each(['waiting', 'completed'] as const)(
      'keeps immutable attempt identity across two dispatchers and a %s winner',
      async (phase) => {
        const f = await auditFixture(dialect);
        const firstEngine = new WorkflowEngine({
          database: f.database,
          timeoutReaper: false,
        });
        const secondEngine = new WorkflowEngine({
          database: f.database,
          timeoutReaper: false,
        });
        let releaseA!: () => void;
        let releaseB!: () => void;
        let enteredA!: () => void;
        let enteredB!: () => void;
        const gateA = new Promise<void>((resolve) => {
          releaseA = resolve;
        });
        const gateB = new Promise<void>((resolve) => {
          releaseB = resolve;
        });
        const startA = new Promise<void>((resolve) => {
          enteredA = resolve;
        });
        const startB = new Promise<void>((resolve) => {
          enteredB = resolve;
        });
        let calls = 0;
        const instruction = defineTestInstruction(
          'two-dispatchers',
          async () => {
            const call = ++calls;
            if (call === 2) {
              enteredA();
              await gateA;
            }
            if (call === 3) {
              enteredB();
              await gateB;
            }
            return {
              status:
                call === 2 && phase === 'completed'
                  ? NODE_RUN_STATUS.RESOLVED
                  : NODE_RUN_STATUS.PENDING,
            };
          },
        );
        firstEngine.registerInstruction(instruction);
        secondEngine.registerInstruction(instruction);
        let a: Promise<unknown> | undefined;
        let b: Promise<unknown> | undefined;
        try {
          const workflow = await createTestWorkflow(f.database, {
            key: 'two-dispatchers',
            nodes: [{ key: 'wait', type: 'two-dispatchers' }],
          });
          await f.runtime.runAuthenticated(
            {
              actor: { type: 'user', id: 'original' },
              roleIds: ['original-role'],
            },
            () => firstEngine.trigger(workflow, {}),
          );
          const row = await f.database
            .query()
            .selectFrom('workflowRuns')
            .selectAll()
            .executeTakeFirstOrThrow();
          a = f.runtime.runAuthenticated(
            { actor: { type: 'user', id: 'caller-A' }, roleIds: ['role-A'] },
            () =>
              firstEngine.dispatch({
                executionId: String(row.id),
                rerun: { nodeKey: 'wait' },
                attemptId: 'A',
              }),
          );
          await startA;
          b = f.runtime.runAuthenticated(
            { actor: { type: 'user', id: 'caller-B' }, roleIds: ['role-B'] },
            () =>
              secondEngine.dispatch({
                executionId: String(row.id),
                rerun: { nodeKey: 'wait' },
                attemptId: 'B',
              }),
          );
          await startB;
          releaseA();
          await a;
          releaseB();
          await b;
          const events = await f.events();
          expect(events).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                action: 'workflow.' + phase,
                details: { attempt: 'A' },
              }),
            ]),
          );
          if (phase === 'waiting')
            expect(events).toEqual(
              expect.arrayContaining([
                expect.objectContaining({
                  action: 'workflow.waiting',
                  details: { attempt: 'B' },
                }),
              ]),
            );
          else {
            expect(
              events.filter((event) => event.action === 'workflow.completed'),
            ).toHaveLength(1);
            const persisted = await f.database
              .query()
              .selectFrom('workflowRuns')
              .where('id', '=', row.id)
              .value('auditContext');
            const context =
              typeof persisted === 'string' ? JSON.parse(persisted) : persisted;
            expect(context).toMatchObject({ attempt: 'A' });
          }
          expect(
            events.every(
              (event) =>
                event.initiator?.id === 'original' &&
                event.roleIds === undefined,
            ),
          ).toBe(true);
          expect(calls).toBe(3);
        } finally {
          releaseA();
          releaseB();
          await Promise.allSettled([a, b]);
          await firstEngine.dispose();
          await secondEngine.dispose();
          await f.dispose();
        }
      },
    );
  });

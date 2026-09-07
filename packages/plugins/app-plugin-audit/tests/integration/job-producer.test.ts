import { describe, expect, it } from 'vitest';
import {
  Job,
  createQueueManager,
  createSyncQueueConfig,
  type JobOptions,
} from '@nocobase/queue';
import {
  TrustedAuditRuntime,
  NodeAuditScopeCarrier,
  bindAuditRecorder,
} from '@nocobase/app-plugin-audit/server';
import type { AuditBackgroundTrace } from '@nocobase/app-plugin-audit/server';
import type { TrustedAuditScope } from '@nocobase/app-plugin-audit/server/contracts';
import { auditRaw } from '../../server/database/sql-client.js';
import {
  createPortableFixture,
  dialects,
} from '../helpers/database-fixtures.js';

for (const dialect of dialects)
  describe(`G18 real Job scope ${dialect}`, () => {
    it('restores bounded serialized hints from trusted state, preserves attempts, and cleans scope', async () => {
      const f = await createPortableFixture(dialect);
      const runtime = new TrustedAuditRuntime({
        appId: f.scope.appId,
        carrier: new NodeAuditScopeCarrier(f.scope.appId),
        bind: (scope) =>
          bindAuditRecorder(scope, {
            store: f.store,
            producer: 'g18-job',
            policy: async () => ({
              enabled: true,
              revision: 1,
              maxDetailsBytes: 4096,
            }),
          }),
        diagnostic: () => undefined,
      });
      const trusted: TrustedAuditScope = {
        ...f.scope,
        actor: { type: 'service', id: 'synthetic-job' },
        initiator: { type: 'user', id: 'owner' },
        roleIds: ['worker'],
        operationId: 'g18-operation',
        requestId: 'g18-request',
        runId: 'g18-job-run',
      };
      let calls = 0;
      let observationFailures = 0;
      const seen: string[] = [];
      // The factory is trusted host composition; the payload cannot install the verifier.
      class ExampleJob extends Job<{
        trace: AuditBackgroundTrace;
        failFirst?: boolean;
      }> {
        static options: JobOptions = {
          name: `g18-synthetic-${dialect}`,
          queue: 'default',
          maxRetries: 1,
        };
        async execute(): Promise<void> {
          expect(runtime.current().actor.type).toBe('unknown');
          const { trace } = this.payload;
          const attempt = this.context.attempt;
          await runtime.runBackground(
            trace,
            async (hints) =>
              hints.runId === trusted.runId ? trusted : undefined,
            async () => {
              seen.push(runtime.current().actor.type);
              expect(runtime.current().roleIds).toEqual(['worker']);
              const observe = async (
                ...args: Parameters<typeof runtime.recorder.record>
              ): Promise<void> => {
                try {
                  await runtime.recorder.record(...args);
                } catch {
                  observationFailures++;
                }
              };
              await observe(
                {
                  action: 'job.attempt',
                  outcome: 'accepted',
                  details: { attempt },
                },
                { idempotencyKey: `g18:${attempt}:started` },
              );
              calls++;
              let outcome: 'success' | 'failed' = 'success';
              try {
                if (attempt === 1 && this.payload.failFirst !== false)
                  throw new Error('G18_JOB_EXTERNAL_FAILURE');
              } catch (error) {
                outcome = 'failed';
                throw error;
              } finally {
                for (let delivery = 0; delivery < 2; delivery++)
                  await observe(
                    {
                      action: 'job.result',
                      outcome,
                      details: { attempt },
                    },
                    { idempotencyKey: `g18:${attempt}:result` },
                  );
              }
            },
          );
          expect(runtime.current().actor.type).toBe('unknown');
        }
      }
      const queue = createQueueManager(createSyncQueueConfig());
      try {
        const trace = await runtime.runBackground(
          { appId: f.scope.appId },
          async () => trusted,
          async () => runtime.exportBackgroundTrace(),
        );
        const serialized = JSON.stringify(trace);
        expect(serialized).not.toMatch(/actor|initiator|roleIds|owner/);
        const restored: AuditBackgroundTrace = JSON.parse(serialized);
        await queue.dispatch(ExampleJob, { trace: restored });
        expect(runtime.current().actor.type).toBe('unknown');
        expect(calls).toBe(2);
        expect(seen).toEqual(['service', 'service']);
        const events = (await f.store.query(f.scope, { store: 'main' })).items;
        expect(events).toHaveLength(4);
        expect(
          events.every(
            (e) =>
              e.initiator?.id === 'owner' && e.operationId === 'g18-operation',
          ),
        ).toBe(true);
        expect(
          events
            .filter((e) => e.action === 'job.result')
            .map((e) => e.outcome)
            .sort(),
        ).toEqual(['failed', 'success']);
        await expect(
          runtime.runBackground(
            { ...trace, runId: 'forged' },
            async (hints) =>
              hints.runId === trusted.runId ? trusted : undefined,
            async () => {
              calls++;
            },
          ),
        ).rejects.toMatchObject({ code: 'AUDIT_INVALID_EVENT' });
        expect(calls).toBe(2);
        await auditRaw(f.connection, 'DROP TABLE "auditEvents"');
        await queue.dispatch(ExampleJob, { trace: restored, failFirst: false });
        expect(calls).toBe(3);
        expect(observationFailures).toBe(3);
        expect(runtime.current().actor.type).toBe('unknown');
      } finally {
        await queue.close();
        runtime.dispose();
        await f.cleanup();
      }
    }, 120000);
  });

import { describe, expect, it } from 'vitest';
import type { Knex } from 'knex';
import migration from '../database/migrations/202609060001_workflow_audit_context.js';
import { auditDialects, auditFixture } from './audit-fixture.js';
import { workflowDatabaseTime } from '../server/engine/database-time.js';
import { createTestWorkflow } from './helpers.js';
import { loadRun } from '../server/engine/utils.js';

for (const dialect of auditDialects)
  describe(`workflow audit migration ${dialect}`, () => {
    it('reverses and reapplies its explicit column while preserving existing run data', async () => {
      const f = await auditFixture(dialect, '+08:00');
      try {
        const client = await f.connection.client<Knex>();
        expect(
          await client.schema.hasColumn('workflow_runs', 'audit_context'),
        ).toBe(true);
        const workflow = await createTestWorkflow(f.database, {
          key: 'migration-existing',
          nodes: [],
        });
        await f.database
          .query()
          .insertInto('workflowRuns')
          .values({
            workflowId: workflow.id,
            workflowKey: workflow.key,
            eventKey: 'legacy',
            input: '{}',
            parameters: '{}',
            createdAt: workflowDatabaseTime(
              '2026-09-05T23:59:59.000Z',
              dialect,
            ),
          })
          .execute();
        expect(
          (await f.metadata.getCollection('workflowRuns'))?.fields.some(
            (field) => field.name === 'auditContext',
          ),
        ).toBe(true);
        await migration.down(f.context);
        expect(
          await client.schema.hasColumn('workflow_runs', 'audit_context'),
        ).toBe(false);
        expect(
          (await f.metadata.getCollection('workflowRuns'))?.fields.some(
            (field) => field.name === 'auditContext',
          ),
        ).toBe(false);
        await migration.up(f.context);
        expect(
          await client.schema.hasColumn('workflow_runs', 'audit_context'),
        ).toBe(true);
        const row = await f.database
          .query()
          .selectFrom('workflowRuns')
          .selectAll()
          .where('eventKey', '=', 'legacy')
          .executeTakeFirstOrThrow();
        expect(row.auditContext).toBeNull();
        expect(
          (await loadRun(f.database.query(), String(row.id)))?.createdAt,
        ).toBe('2026-09-05T23:59:59.000Z');
        expect(workflowDatabaseTime(null, dialect)).toBeNull();
        await f.database
          .query()
          .updateTable('workflowRuns')
          .set({
            startedAt: workflowDatabaseTime(
              '2026-09-06T00:00:01.123Z',
              dialect,
            ),
          })
          .where('id', '=', row.id)
          .execute();
        const run = await loadRun(f.database.query(), String(row.id));
        // The original MySQL migration declares DATETIME(0), which has second precision.
        expect(run?.startedAt).toBe(
          dialect === 'mysql'
            ? '2026-09-06T00:00:01.000Z'
            : '2026-09-06T00:00:01.123Z',
        );
      } finally {
        await f.dispose();
      }
    });
  });

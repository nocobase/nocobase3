import { expect, it } from 'vitest';
import { describeIntegrationDatabases } from '../../helpers.js';
import {
  allProjects,
  captureSql,
  createTenantFixture,
  selection,
} from '../fixtures/tenants.js';

/**
 * Invariant 2: a record must still satisfy this operation's scope after the
 * write, or the transaction rolls back.
 *
 * This is the whole of the write-side rule, and on its own it stops the two
 * escalations a WHERE clause cannot: creating a record in someone else's
 * tenant, and moving one of yours into theirs. The scope decides how tight
 * that is, so no separate "scope fields are read-only" switch is needed.
 */
describeIntegrationDatabases(
  'Repository policy write-back scope',
  (context) => {
    const scoped = () =>
      context.connection.repository('policyProjects').withPolicy({
        read: { scope: { tenantId: 'T1' }, fields: ['id', 'tenantId', 'name'] },
        // tenantId is writable on purpose: the scope, not a field lock, is what
        // has to stop the record leaving.
        create: {
          scope: { tenantId: 'T1' },
          fields: ['id', 'tenantId', 'name'],
        },
        update: { scope: { tenantId: 'T1' }, fields: ['tenantId', 'name'] },
        delete: { scope: { tenantId: 'T1' } },
      });

    it('PW-01 refuses a create that lands outside create.scope, and writes nothing', async () => {
      await createTenantFixture(context);
      await expect(
        scoped().createOne({
          values: { id: 'p9', tenantId: 'T2', name: 'Smuggled' },
          select: selection(['id']),
        }),
      ).rejects.toMatchObject({ code: 'SCOPE_VIOLATION' });

      expect(await allProjects(context)).toHaveLength(3);
    });

    it('PW-02 accepts a create that lands inside it', async () => {
      await createTenantFixture(context);
      const created = await scoped().createOne({
        values: { id: 'p9', tenantId: 'T1', name: 'Mine' },
        select: selection(['id', 'tenantId']),
      });

      expect(created.record).toEqual({ id: 'p9', tenantId: 'T1' });
    });

    it('PW-03 refuses an update that moves the record out of update.scope', async () => {
      await createTenantFixture(context);
      await expect(
        scoped().updateOne({
          filter: { id: 'p1' },
          values: { tenantId: 'T2' },
        }),
      ).rejects.toMatchObject({ code: 'SCOPE_VIOLATION' });

      // Rolled back, tenant intact.
      expect(await allProjects(context)).toContainEqual(
        expect.objectContaining({ id: 'p1', tenantId: 'T1' }),
      );
    });

    it('PW-04 refuses a bulk update that moves records out, and rolls all of them back', async () => {
      await createTenantFixture(context);
      await expect(
        scoped().updateMany({ all: true, values: { tenantId: 'T2' } }),
      ).rejects.toMatchObject({ code: 'SCOPE_VIOLATION' });

      expect(await allProjects(context)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: 'p1', tenantId: 'T1' }),
          expect.objectContaining({ id: 'p2', tenantId: 'T1' }),
        ]),
      );
    });

    it('PW-05 issues no extra statement when the write cannot reach the scope', async () => {
      await createTenantFixture(context);
      const repository = scoped();
      await repository.updateOne({
        filter: { id: 'p1' },
        values: { name: 'a' },
      });

      const touching = await captureSql(context, () =>
        repository.updateOne({
          filter: { id: 'p1' },
          values: { tenantId: 'T1' },
        }),
      );
      const notTouching = await captureSql(context, () =>
        repository.updateOne({ filter: { id: 'p1' }, values: { name: 'b' } }),
      );

      // Renaming cannot move a record between tenants, so it is not judged and
      // the ordinary update path stays as cheap as it was without a policy.
      expect(notTouching.statements.length).toBeLessThan(
        touching.statements.length,
      );
    });

    it('PW-06 upserts onto a record in scope, and refuses one outside it', async () => {
      await createTenantFixture(context);
      const repository = scoped();

      const updated = await repository.upsertOne({
        filter: { id: 'p1' },
        create: { id: 'p1', tenantId: 'T1', name: 'Created' },
        update: { name: 'Updated' },
        select: selection(['id', 'name']),
      });
      expect(updated.record).toEqual({ id: 'p1', name: 'Updated' });

      // p3 exists and is reachable by its key, but belongs to the other tenant.
      // It must not degrade into an insert, which would only collide with the
      // unique constraint and report a misleading duplicate key.
      await expect(
        repository.upsertOne({
          filter: { id: 'p3' },
          create: { id: 'p3', tenantId: 'T1', name: 'Created' },
          update: { name: 'Stolen' },
          select: selection(['id']),
        }),
      ).rejects.toMatchObject({ code: 'RECORD_OUTSIDE_SCOPE' });

      expect(await allProjects(context)).toContainEqual(
        expect.objectContaining({ id: 'p3', tenantId: 'T2' }),
      );
    });

    it('PW-07 inserts through upsert when the target does not exist', async () => {
      await createTenantFixture(context);
      const created = await scoped().upsertOne({
        filter: { id: 'p9' },
        create: { id: 'p9', tenantId: 'T1', name: 'Created' },
        update: { name: 'Updated' },
        select: selection(['id', 'name']),
      });

      expect(created.record).toEqual({ id: 'p9', name: 'Created' });
    });

    it('PW-08 refuses an upsert insert that lands outside create.scope', async () => {
      await createTenantFixture(context);
      await expect(
        scoped().upsertOne({
          filter: { id: 'p9' },
          create: { id: 'p9', tenantId: 'T2', name: 'Smuggled' },
          update: { name: 'Updated' },
          select: selection(['id']),
        }),
      ).rejects.toMatchObject({ code: 'SCOPE_VIOLATION' });

      expect(await allProjects(context)).toHaveLength(3);
    });

    it('PW-09 refuses a bulk create that lands outside create.scope', async () => {
      await createTenantFixture(context);
      await expect(
        scoped().createMany({
          values: [
            { id: 'p8', tenantId: 'T1', name: 'Fine' },
            { id: 'p9', tenantId: 'T2', name: 'Smuggled' },
          ],
        }),
      ).rejects.toMatchObject({ code: 'SCOPE_VIOLATION' });

      // The whole batch rolls back, including the row that was acceptable.
      expect(await allProjects(context)).toHaveLength(3);
    });

    it('PW-10 applies create defaults that the caller cannot override', async () => {
      await createTenantFixture(context);
      const repository = context.connection
        .repository('policyProjects')
        .withPolicy({
          read: { scope: true, fields: ['id', 'tenantId'] },
          create: {
            scope: { tenantId: 'T1' },
            defaults: { tenantId: 'T1' },
            fields: ['id', 'name'],
          },
          update: { scope: true },
          delete: { scope: true },
        });

      const created = await repository.createOne({
        values: { id: 'p9', name: 'Mine' },
        select: selection(['id', 'tenantId']),
      });
      expect(created.record).toEqual({ id: 'p9', tenantId: 'T1' });

      // tenantId is not in create.fields, so submitting it is refused outright
      // rather than silently overwritten.
      await expect(
        repository.createOne({
          values: { id: 'p10', name: 'Other', tenantId: 'T2' },
          select: selection(['id']),
        }),
      ).rejects.toMatchObject({
        code: 'FIELD_WRITE_FORBIDDEN',
        field: 'tenantId',
      });
    });
  },
);

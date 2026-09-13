import { expect, it } from 'vitest';
import { describeIntegrationDatabases } from '../../helpers.js';
import {
  allProjects,
  createTenantFixture,
  selection,
  TENANT_FIELDS,
} from '../fixtures/tenants.js';

/**
 * Phase 1 acceptance: out of scope and does not exist must be one answer.
 *
 * Any difference between them is an existence oracle. A caller who can tell
 * "forbidden" from "absent" enumerates another tenant's primary keys by
 * trying them one at a time, and learns which of them are real without ever
 * reading a row. So each pair below asserts the same call against a row that
 * belongs to someone else and against a row that was never created, and
 * requires the two results to be identical.
 */
describeIntegrationDatabases(
  'Repository policy existence indistinguishability',
  (context) => {
    const scoped = () =>
      context.database.repository('policyProjects').withPolicy({
        read: { scope: { tenantId: 'T1' }, fields: [...TENANT_FIELDS] },
        create: { scope: true, fields: ['id', 'tenantId', 'name'] },
        update: { scope: { tenantId: 'T1' }, fields: ['name', 'budget'] },
        delete: { scope: { tenantId: 'T1' } },
      });

    it('PI-01 findOne answers the same for another tenant and for nothing', async () => {
      await createTenantFixture(context);
      const repository = scoped();
      const select = selection(['id']);

      const foreign = await repository.findOne({
        filter: { id: 'p3' },
        select,
      });
      const missing = await repository.findOne({
        filter: { id: 'nope' },
        select,
      });

      expect(foreign).toBeUndefined();
      expect(foreign).toEqual(missing);
    });

    it('PI-02 findMany, count and exists answer the same', async () => {
      await createTenantFixture(context);
      const repository = scoped();

      for (const [foreignId, missingId] of [['p3', 'nope']] as const) {
        expect(
          await repository.findMany({
            filter: { id: foreignId },
            select: selection(['id']),
          }),
        ).toEqual(
          await repository.findMany({
            filter: { id: missingId },
            select: selection(['id']),
          }),
        );
        expect(await repository.count({ filter: { id: foreignId } })).toBe(
          await repository.count({ filter: { id: missingId } }),
        );
        expect(await repository.exists({ filter: { id: foreignId } })).toBe(
          await repository.exists({ filter: { id: missingId } }),
        );
      }
    });

    it('PI-03 updateOne and deleteOne raise the same error for both', async () => {
      await createTenantFixture(context);
      const repository = scoped();

      const errors = await Promise.all(
        (['p3', 'nope'] as const).flatMap((id) => [
          repository
            .updateOne({ filter: { id }, values: { name: 'x' } })
            .then(() => undefined)
            .catch((error: { code?: string; message?: string }) => ({
              code: error.code,
              message: error.message,
            })),
          repository
            .deleteOne({ filter: { id } })
            .then(() => undefined)
            .catch((error: { code?: string; message?: string }) => ({
              code: error.code,
              message: error.message,
            })),
        ]),
      );
      const [foreignUpdate, foreignDelete, missingUpdate, missingDelete] =
        errors;

      expect(foreignUpdate).toMatchObject({ code: 'RECORD_NOT_FOUND' });
      expect(foreignUpdate).toEqual(missingUpdate);
      expect(foreignDelete).toMatchObject({ code: 'RECORD_NOT_FOUND' });
      expect(foreignDelete).toEqual(missingDelete);

      // And the row that was merely invisible is still there.
      expect(await allProjects(context)).toContainEqual(
        expect.objectContaining({ id: 'p3' }),
      );
    });

    it('PI-04 updateMany and deleteMany count zero without raising', async () => {
      await createTenantFixture(context);
      const repository = scoped();

      expect(
        await repository.updateMany({
          filter: { id: 'p3' },
          values: { name: 'x' },
        }),
      ).toEqual(
        await repository.updateMany({
          filter: { id: 'nope' },
          values: { name: 'x' },
        }),
      );
      expect(await repository.deleteMany({ filter: { id: 'p3' } })).toEqual(
        await repository.deleteMany({ filter: { id: 'nope' } }),
      );
      expect(await allProjects(context)).toHaveLength(3);
    });

    it('PI-05 prefers the scope answer over a version conflict', async () => {
      await createTenantFixture(context);
      // A version mismatch that reported VERSION_CONFLICT for a row outside
      // the scope would make the version number itself an existence signal.
      const repository = scoped();
      await expect(
        repository.updateOne({
          filter: { id: 'p3' },
          values: { name: 'x' },
          ifVersion: 999,
        }),
      ).rejects.toMatchObject({ code: 'RECORD_NOT_FOUND' });
    });
  },
);

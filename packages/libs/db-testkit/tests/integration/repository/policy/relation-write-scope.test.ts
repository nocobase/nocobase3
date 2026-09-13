import { expect, it } from 'vitest';
import { describeIntegrationDatabases } from '../../helpers.js';
import { createTenantFixture, selection } from '../fixtures/tenants.js';

/**
 * A relation write reaches its target straight from the target table, so the
 * root scope does not constrain it.
 *
 * Without a scope of its own, a caller confined to their own tenant could
 * still `connect` somebody else's row into their data: the root scope stopped
 * them touching the wrong project, not the wrong task. Authorizing a relation
 * write is deciding on the target Collection's behalf, so the target scope is
 * the only thing that can say which rows.
 */
describeIntegrationDatabases(
  'Repository policy relation write scope',
  (context) => {
    const scoped = () =>
      context.connection.repository('policyProjects').withPolicy({
        read: { scope: true, fields: ['id'] },
        create: { scope: true, fields: ['id', 'tenantId', 'name'] },
        update: {
          scope: true,
          fields: ['name'],
          relations: {
            tasks: {
              scope: { tenantId: 'T1' },
              connect: {},
              disconnect: {},
              update: { fields: ['title'] },
              delete: {},
            },
          },
        },
        delete: { scope: true },
      });

    const taskOf = async (id: string) =>
      (
        await context.connection.repository('policyTasks').findMany({
          filter: { id },
          select: selection(['id', 'projectId', 'title']),
        })
      )[0];

    it('PRW-01 connects a target inside the relation scope', async () => {
      await createTenantFixture(context);
      await scoped().updateOne({
        filter: { id: 'p2' },
        values: { tasks: { connect: [{ id: 't4' }] } },
      });

      expect(await taskOf('t4')).toMatchObject({ projectId: 'p2' });
    });

    it('PRW-02 refuses to connect a target outside it', async () => {
      await createTenantFixture(context);
      // t5 belongs to the other tenant. Connecting it would pull their row
      // into this caller's data.
      await expect(
        scoped().updateOne({
          filter: { id: 'p2' },
          values: { tasks: { connect: [{ id: 't5' }] } },
        }),
      ).rejects.toMatchObject({ code: 'RECORD_NOT_FOUND' });

      expect(await taskOf('t5')).toMatchObject({ projectId: null });
    });

    it('PRW-03 answers the same for an out-of-scope target and a missing one', async () => {
      await createTenantFixture(context);
      const attempt = async (id: string) =>
        scoped()
          .updateOne({
            filter: { id: 'p2' },
            values: { tasks: { connect: [{ id }] } },
          })
          .then(() => undefined)
          .catch((error: { code?: string; message?: string }) => ({
            code: error.code,
            message: error.message,
          }));

      expect(await attempt('t5')).toEqual(await attempt('nope'));
    });

    it('PRW-04 refuses to update a target outside the relation scope', async () => {
      await createTenantFixture(context);
      await expect(
        scoped().updateOne({
          filter: { id: 'p1' },
          values: {
            tasks: {
              update: [{ filter: { id: 't2' }, values: { title: 'Stolen' } }],
            },
          },
        }),
      ).rejects.toMatchObject({ code: 'RELATION_TARGET_NOT_FOUND' });

      expect(await taskOf('t2')).toMatchObject({ title: 'Theirs' });
    });

    it('PRW-05 refuses to delete a target outside the relation scope', async () => {
      await createTenantFixture(context);
      await expect(
        scoped().updateOne({
          filter: { id: 'p1' },
          values: { tasks: { delete: [{ filter: { id: 't2' } }] } },
        }),
      ).rejects.toMatchObject({ code: 'RELATION_TARGET_NOT_FOUND' });

      expect(await taskOf('t2')).toBeDefined();
    });

    it('PRW-06 updates a target inside the relation scope', async () => {
      await createTenantFixture(context);
      await scoped().updateOne({
        filter: { id: 'p1' },
        values: {
          tasks: {
            update: [{ filter: { id: 't1' }, values: { title: 'Renamed' } }],
          },
        },
      });

      expect(await taskOf('t1')).toMatchObject({ title: 'Renamed' });
    });

    it('PRW-07 leaves a relation without a scope unconstrained', async () => {
      await createTenantFixture(context);
      await context.connection
        .repository('policyProjects')
        .withPolicy({
          read: { scope: true, fields: ['id'] },
          create: { scope: true },
          update: {
            scope: true,
            fields: ['name'],
            relations: { tasks: { connect: {} } },
          },
          delete: { scope: true },
        })
        .updateOne({
          filter: { id: 'p2' },
          values: { tasks: { connect: [{ id: 't5' }] } },
        });

      expect(await taskOf('t5')).toMatchObject({ projectId: 'p2' });
    });
  },
);

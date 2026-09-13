import { describe, expect, it } from 'vitest';
import { DefaultRepository } from '../../../../src/repository/repository.js';

describe('DefaultRepository.withPolicy', () => {
  it('returns an immutable scoped repository with a normalized policy', () => {
    const repository = new DefaultRepository({
      collection: 'projects',
      collections: {} as never,
      adapter: {} as never,
    });
    const policy = {
      read: {
        scope: { tenantId: 'T1' },
        fields: ['id', 'title'],
      },
      create: { scope: true, fields: ['title'] },
      update: { scope: true, fields: ['title'] },
      delete: { scope: true },
    } as const;

    const scoped = repository.withPolicy(policy);

    expect(() => repository.explainPolicy()).toThrowError(
      'Repository does not have a bound Policy.',
    );
    expect(scoped.explainPolicy()).toMatchObject({
      read: {
        fields: ['id', 'title'],
        relations: {},
      },
    });
    expect(scoped).not.toBe(repository);
  });

  it('evaluates principal policies once at binding time', () => {
    const repository = new DefaultRepository({
      collection: 'projects',
      collections: {} as never,
      adapter: {} as never,
    });
    let calls = 0;

    const scoped = repository.withPolicy(
      (principal: { tenantId: string }) => {
        calls += 1;
        return {
          read: { scope: { tenantId: principal.tenantId } },
          create: { scope: true },
          update: { scope: true },
          delete: { scope: true },
        };
      },
      { tenantId: 'T1' },
    );

    expect(calls).toBe(1);
    expect(scoped.explainPolicy().read).toMatchObject({
      scope: {
        root: {
          items: [{ path: ['tenantId'], value: 'T1' }],
        },
      },
    });
  });

  it('adds read scope to the caller filter before execution', async () => {
    let plan: { filter?: { root: { items: unknown[] } } } | undefined;
    const repository = new DefaultRepository({
      collection: 'projects',
      collections: {
        get: async () => ({
          name: 'projects',
          fields: [
            { name: 'id', type: 'string' },
            { name: 'tenantId', type: 'string' },
            { name: 'status', type: 'string' },
          ],
        }),
      },
      adapter: {
        assertReadable: () => undefined,
        count: async (nextPlan: typeof plan) => {
          plan = nextPlan;
          return 0;
        },
      } as never,
    });

    await repository
      .withPolicy({
        read: { scope: { tenantId: 'T1' } },
        create: { scope: true },
        update: { scope: true },
        delete: { scope: true },
      })
      .count({ filter: { status: 'draft' } });

    expect(plan?.filter?.root.items).toHaveLength(2);
    expect(plan?.filter?.root.items).toEqual([
      expect.objectContaining({
        logic: 'and',
        items: [expect.objectContaining({ path: ['status'], value: 'draft' })],
      }),
      expect.objectContaining({
        logic: 'and',
        items: [expect.objectContaining({ path: ['tenantId'], value: 'T1' })],
      }),
    ]);
  });

  it('uses the mutation scope instead of read scope for updates', async () => {
    let updateFilter: { root: { items: readonly unknown[] } } | undefined;
    const repository = new DefaultRepository({
      collection: 'projects',
      collections: {
        get: async () => ({
          name: 'projects',
          fields: [
            { name: 'id', type: 'string' },
            { name: 'tenantId', type: 'string' },
            { name: 'ownerId', type: 'string' },
            { name: 'title', type: 'string' },
          ],
        }),
      },
      adapter: {
        updateOne: async (plan: { filter: typeof updateFilter }) => {
          updateFilter = plan.filter;
          return {
            record: { id: 'p1' },
            createdTargets: [],
          };
        },
      } as never,
    });

    await repository
      .withPolicy({
        read: { scope: { tenantId: 'T1' } },
        create: { scope: true },
        update: { scope: { ownerId: 'u1' }, fields: ['title'] },
        delete: { scope: { tenantId: 'T1' } },
      })
      .updateOne({
        filter: { id: 'p1' },
        values: { title: 'Updated' },
      });

    expect(updateFilter?.root.items).toEqual([
      expect.objectContaining({
        logic: 'and',
        items: [expect.objectContaining({ path: ['id'], value: 'p1' })],
      }),
      expect.objectContaining({
        logic: 'and',
        items: [expect.objectContaining({ path: ['ownerId'], value: 'u1' })],
      }),
    ]);
  });

  it('restricts implicit root selection to the read field allowlist', async () => {
    let plan:
      | {
          fields: readonly string[];
        }
      | undefined;
    const repository = new DefaultRepository({
      collection: 'projects',
      collections: {
        get: async () => ({
          name: 'projects',
          fields: [
            { name: 'id', type: 'string' },
            { name: 'title', type: 'string' },
            { name: 'budget', type: 'number' },
          ],
        }),
      },
      adapter: {
        assertReadable: () => undefined,
        findMany: async (nextPlan: typeof plan) => {
          plan = nextPlan;
          return [];
        },
      } as never,
    });

    await repository
      .withPolicy({
        read: { scope: true, fields: ['id', 'title'] },
        create: { scope: true },
        update: { scope: true },
        delete: { scope: true },
      })
      .findMany();

    expect(plan?.fields).toEqual(['id', 'title']);
  });

  it('rejects explicitly selected root fields outside the read allowlist', async () => {
    const repository = new DefaultRepository({
      collection: 'projects',
      collections: {
        get: async () => ({
          name: 'projects',
          fields: [
            { name: 'id', type: 'string' },
            { name: 'title', type: 'string' },
            { name: 'budget', type: 'number' },
          ],
        }),
      },
      adapter: {
        assertReadable: () => undefined,
        findMany: async () => [],
      } as never,
    });

    await expect(
      repository
        .withPolicy({
          read: { scope: true, fields: ['id', 'title'] },
          create: { scope: true },
          update: { scope: true },
          delete: { scope: true },
        })
        .findMany({
          select: {
            kind: 'select',
            version: 1,
            root: {
              kind: 'selection',
              fields: ['id', 'budget'],
              includes: [],
            },
          },
        }),
    ).rejects.toMatchObject({ code: 'FIELD_READ_FORBIDDEN', field: 'budget' });
  });

  it('returns no root scalar fields when read fields are omitted', async () => {
    let plan:
      | {
          fields: readonly string[];
        }
      | undefined;
    const repository = new DefaultRepository({
      collection: 'projects',
      collections: {
        get: async () => ({
          name: 'projects',
          fields: [
            { name: 'id', type: 'string' },
            { name: 'title', type: 'string' },
          ],
        }),
      },
      adapter: {
        assertReadable: () => undefined,
        findMany: async (nextPlan: typeof plan) => {
          plan = nextPlan;
          return [];
        },
      } as never,
    });

    await repository
      .withPolicy({
        read: { scope: true },
        create: { scope: true },
        update: { scope: true },
        delete: { scope: true },
      })
      .findMany();

    expect(plan?.fields).toEqual([]);
  });
});

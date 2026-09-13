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

  it('rejects relations that are absent from the read relation allowlist', async () => {
    const repository = new DefaultRepository({
      collection: 'projects',
      collections: {
        get: async (name: string) =>
          name === 'projects'
            ? {
                name,
                fields: [
                  { name: 'id', type: 'string' },
                  { name: 'tasks', type: 'hasMany', target: 'tasks' },
                ],
              }
            : {
                name,
                fields: [{ name: 'id', type: 'string' }],
              },
      },
      adapter: {
        assertReadable: () => undefined,
        findMany: async () => [],
      } as never,
    });

    await expect(
      repository
        .withPolicy({
          read: { scope: true, fields: ['id'], relations: {} },
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
              fields: ['id'],
              includes: [
                {
                  kind: 'include',
                  relation: 'tasks',
                  select: {
                    kind: 'selection',
                    fields: ['id'],
                    includes: [],
                  },
                },
              ],
            },
          },
        }),
    ).rejects.toMatchObject({
      code: 'RELATION_READ_FORBIDDEN',
      relation: 'tasks',
    });
  });

  it('applies a relation read field allowlist to nested selections', async () => {
    let plan:
      | {
          select?: {
            root: {
              includes: Array<{
                relation: string;
                select?: { fields?: readonly string[] };
              }>;
            };
          };
        }
      | undefined;
    const repository = new DefaultRepository({
      collection: 'projects',
      collections: {
        get: async (name: string) =>
          name === 'projects'
            ? {
                name,
                fields: [
                  { name: 'id', type: 'string' },
                  { name: 'tasks', type: 'hasMany', target: 'tasks' },
                ],
              }
            : {
                name,
                fields: [
                  { name: 'id', type: 'string' },
                  { name: 'title', type: 'string' },
                  { name: 'secret', type: 'string' },
                ],
              },
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
        read: {
          scope: true,
          fields: ['id'],
          relations: {
            tasks: { scope: true, fields: ['id', 'title'], relations: {} },
          },
        },
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
            fields: ['id'],
            includes: [
              {
                kind: 'include',
                relation: 'tasks',
                select: { kind: 'selection', includes: [] },
              },
            ],
          },
        },
      });

    expect(plan?.select?.root.includes[0]).toMatchObject({
      relation: 'tasks',
      select: { fields: ['id', 'title'] },
    });
  });

  it('adds the relation read scope to the nested relation filter', async () => {
    let plan:
      | {
          select?: {
            root: {
              includes: Array<{
                filter?: { root: { items: unknown[] } };
              }>;
            };
          };
        }
      | undefined;
    const repository = new DefaultRepository({
      collection: 'projects',
      collections: {
        get: async (name: string) =>
          name === 'projects'
            ? {
                name,
                fields: [
                  { name: 'id', type: 'string' },
                  { name: 'tasks', type: 'hasMany', target: 'tasks' },
                ],
              }
            : {
                name,
                fields: [
                  { name: 'id', type: 'string' },
                  { name: 'status', type: 'string' },
                  { name: 'tenantId', type: 'string' },
                ],
              },
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
        read: {
          scope: true,
          fields: ['id'],
          relations: {
            tasks: {
              scope: { tenantId: 'T1' },
              fields: ['id'],
              relations: {},
            },
          },
        },
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
            fields: ['id'],
            includes: [
              {
                kind: 'include',
                relation: 'tasks',
                filter: {
                  kind: 'filter',
                  version: 1,
                  root: {
                    kind: 'group',
                    logic: 'and',
                    items: [
                      {
                        kind: 'condition',
                        path: ['status'],
                        operator: '$eq',
                        value: 'draft',
                      },
                    ],
                  },
                },
                select: { kind: 'selection', includes: [] },
              },
            ],
          },
        },
      });

    expect(plan?.select?.root.includes[0]?.filter?.root.items).toEqual([
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

  it('enforces create and update field allowlists', async () => {
    const collection = {
      name: 'projects',
      fields: [
        { name: 'id', type: 'string' },
        { name: 'title', type: 'string' },
        { name: 'secret', type: 'string' },
      ],
    };
    const repository = new DefaultRepository({
      collection: 'projects',
      collections: { get: async () => collection },
      adapter: {
        createOne: async () => ({
          record: { id: 'p1', title: 'Created' },
          createdTargets: [],
        }),
        updateOne: async () => ({
          record: { id: 'p1', title: 'Updated' },
          createdTargets: [],
        }),
      } as never,
    });
    const scoped = repository.withPolicy({
      read: { scope: true },
      create: { scope: true, fields: ['title'] },
      update: { scope: true, fields: ['title'] },
      delete: { scope: true },
    });

    await expect(
      scoped.createOne({ values: { secret: 'hidden' } }),
    ).rejects.toMatchObject({
      code: 'FIELD_WRITE_FORBIDDEN',
      field: 'secret',
    });
    await expect(
      scoped.updateOne({
        filter: {
          kind: 'filter',
          version: 1,
          root: { kind: 'group', logic: 'and', items: [] },
        },
        values: { secret: 'hidden' },
      }),
    ).rejects.toMatchObject({
      code: 'FIELD_WRITE_FORBIDDEN',
      field: 'secret',
    });
  });

  it('forbids create and update when their policy nodes are false', async () => {
    const repository = new DefaultRepository({
      collection: 'projects',
      collections: {
        get: async () => ({
          name: 'projects',
          fields: [{ name: 'title', type: 'string' }],
        }),
      },
      adapter: {} as never,
    });
    const scoped = repository.withPolicy({
      read: { scope: true },
      create: false,
      update: false,
      delete: { scope: true },
    });

    await expect(
      scoped.createOne({ values: { title: 'Created' } }),
    ).rejects.toMatchObject({
      code: 'WRITE_FORBIDDEN',
    });
    await expect(
      scoped.updateOne({
        filter: {
          kind: 'filter',
          version: 1,
          root: { kind: 'group', logic: 'and', items: [] },
        },
        values: { title: 'Updated' },
      }),
    ).rejects.toMatchObject({ code: 'WRITE_FORBIDDEN' });
  });
});

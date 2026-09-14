import { describe, expect, it } from 'vitest';
import { DefaultRepository } from '../../../../src/repository/repository.js';

const base = {
  read: {
    scope: { tenantId: 'T1' },
    fields: ['id', 'title', 'budget'],
    relations: {
      tasks: { scope: true, fields: ['id', 'title'] },
      owner: { scope: true, fields: ['id'] },
    },
  },
  create: { scope: true, fields: ['title', 'budget'] },
  update: {
    scope: { tenantId: 'T1' },
    fields: ['title', 'budget'],
    relations: { tasks: { connect: {}, disconnect: {} } },
  },
  delete: { scope: { tenantId: 'T1' } },
} as const;

function scoped() {
  return new DefaultRepository({
    collection: 'projects',
    collections: {} as never,
    adapter: {} as never,
  }).withPolicy(base);
}

describe('ScopedRepository.narrow', () => {
  it('intersects field allowlists and never widens them', () => {
    const narrowed = scoped().narrow({
      read: { fields: ['id', 'title', 'secret'] },
    });

    // 'secret' was not granted, so asking for it does not grant it.
    expect(narrowed.explainPolicy().read).toMatchObject({
      fields: ['id', 'title'],
    });
    // The original is untouched.
    expect(scoped().explainPolicy().read).toMatchObject({
      fields: ['id', 'title', 'budget'],
    });
  });

  it('intersects scopes with AND', () => {
    const narrowed = scoped().narrow({
      update: { scope: { ownerId: 'u1' } },
    });
    const scope = narrowed.explainPolicy().update as {
      scope: { root: { items: readonly unknown[] } };
    };

    expect(scope.scope.root).toMatchObject({
      logic: 'and',
      items: [
        { items: [{ path: ['tenantId'] }] },
        { items: [{ path: ['ownerId'] }] },
      ],
    });
  });

  it('keeps only the relations both sides granted', () => {
    const narrowed = scoped().narrow({
      read: { relations: { tasks: { fields: ['id'] }, missing: {} } },
    });
    const read = narrowed.explainPolicy().read as {
      relations: Record<string, { fields: readonly string[] }>;
    };

    // 'owner' is dropped because the patch did not name it; 'missing' cannot
    // appear because the patch alone never grants anything.
    expect(Object.keys(read.relations)).toEqual(['tasks']);
    expect(read.relations.tasks.fields).toEqual(['id']);
  });

  it('withdraws relation write operations the patch leaves out', () => {
    const narrowed = scoped().narrow({
      update: { relations: { tasks: { connect: {} } } },
    });
    const update = narrowed.explainPolicy().update as unknown as {
      relations: Record<string, Record<string, unknown>>;
    };

    expect(Object.keys(update.relations.tasks)).toEqual(['connect']);
  });

  it('propagates false and cannot be undone by a later narrow', () => {
    const closed = scoped().narrow({ delete: false });
    expect(closed.explainPolicy().delete).toBe(false);
    expect(
      closed.narrow({ delete: { scope: true } }).explainPolicy().delete,
    ).toBe(false);
  });

  it('treats true as adding no limits rather than removing them', () => {
    const narrowed = scoped().narrow({ read: true });
    expect(narrowed.explainPolicy().read).toMatchObject({
      fields: ['id', 'title', 'budget'],
    });
  });

  it('leaves a member the patch does not mention alone', () => {
    const narrowed = scoped().narrow({ read: { fields: ['id'] } });
    const read = narrowed.explainPolicy().read as {
      relations: Record<string, unknown>;
      scope: unknown;
    };

    expect(Object.keys(read.relations).sort()).toEqual(['owner', 'tasks']);
    expect(read.scope).toMatchObject({
      root: { items: [{ path: ['tenantId'] }] },
    });
  });

  it('replaces only the create defaults the patch names', () => {
    const scoped = new DefaultRepository({
      collection: 'projects',
      collections: {} as never,
      adapter: {} as never,
    }).withPolicy({
      read: base.read,
      create: {
        scope: true,
        fields: ['title'],
        defaults: { tenantId: 'T1', source: 'api' },
      },
      update: base.update,
      delete: base.delete,
    });

    // Only `create` accepts `defaults`, so the node kind has to reach the
    // normalizer; narrowing as an update rejected the patch outright.
    const narrowed = scoped.narrow({
      create: { defaults: { tenantId: 'T2' } },
    });
    expect(
      (narrowed.explainPolicy().create as { defaults: unknown }).defaults,
    ).toEqual({ tenantId: 'T2', source: 'api' });
  });

  it('refuses an unknown key', () => {
    expect(() => scoped().narrow({ write: {} } as never)).toThrowError(
      /Unsupported Policy option/,
    );
  });

  it('accumulates across several narrows', () => {
    const narrowed = scoped()
      .narrow({ read: { fields: ['id', 'title'] } })
      .narrow({ read: { fields: ['title'] } });

    expect(narrowed.explainPolicy().read).toMatchObject({ fields: ['title'] });
  });
});

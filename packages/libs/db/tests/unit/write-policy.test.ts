import { describe, expect, it, vi } from 'vitest';
import {
  buildWritePolicy,
  buildUpsertWritePolicy,
  type WritePolicyInput,
  type WritePolicyBuilder,
  type UpsertWritePolicyInput,
} from '../../src/index.js';

describe('write policy builders', () => {
  it('builds the same detached frozen policy as objects with defaults closed at every level', () => {
    const callback = vi.fn((w: WritePolicyBuilder) =>
      w
        .fields('name')
        .relation('tasks', (r) =>
          r
            .create((t) =>
              t.fields('title').relation('assignee', (a) => a.connect()),
            )
            .update((t) =>
              t
                .fields('title')
                .relation('assignee', (a) => a.connect().disconnect()),
            )
            .upsert((u) =>
              u
                .create((t) => t.fields('title'))
                .update((t) => t.fields('title')),
            )
            .disconnect()
            .delete(),
        )
        .relation('tags', (r) =>
          r
            .create((t) => t.fields('label').through((t) => t.fields('role')))
            .connect((e) => e.through((t) => t.fields('role')))
            .set((e) => e.through((t) => t.fields('role'))),
        ),
    );
    const source = {
      fields: ['name'],
      relations: {
        tasks: {
          create: {
            fields: ['title'],
            relations: { assignee: { connect: {} } },
          },
          update: {
            fields: ['title'],
            relations: { assignee: { connect: {}, disconnect: {} } },
          },
          upsert: {
            create: { fields: ['title'] },
            update: { fields: ['title'] },
          },
          disconnect: {},
          delete: {},
        },
        tags: {
          create: { fields: ['label'], through: { fields: ['role'] } },
          connect: { through: { fields: ['role'] } },
          set: { through: { fields: ['role'] } },
        },
      },
    };
    const built = buildWritePolicy(callback);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(built).toEqual(buildWritePolicy(source));
    const snapshot = buildWritePolicy(source);
    source.fields.push('secret');
    source.relations.tasks.update.fields.push('secret');
    expect(snapshot).toEqual(built);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.relations)).toBe(true);
    expect(buildWritePolicy()).toEqual({ fields: false, relations: false });
    expect(buildWritePolicy((w) => w)).toEqual(buildWritePolicy({}));
    expect(buildWritePolicy((w) => w.fields())).toEqual({
      fields: [],
      relations: false,
    });
  });

  it('detaches retained builders from the completed snapshot', () => {
    let retained: WritePolicyBuilder | undefined;
    const policy = buildWritePolicy((w) => {
      retained = w;
      return w.fields('name');
    });
    retained!.relation('tasks', (r) => r.delete());
    expect(policy).toEqual({ fields: ['name'], relations: false });
  });

  it.each([
    true,
    false,
    null,
    [],
    { fields: true },
    { fields: ['*'] },
    { fields: ['task.id'] },
    { fields: ['name', 'name'] },
    { fields: new Array(1) },
    { relations: true },
    { relations: { tasks: true } },
    { relations: { tasks: { update: true } } },
    { relations: { tasks: { disconnect: { fields: ['id'] } } } },
    { relations: { tasks: { update: { through: { fields: ['role'] } } } } },
    { unknown: true },
    { relations: { '*': {} } },
  ])('rejects invalid policy %j', (input) => {
    expect(() => buildWritePolicy(input as WritePolicyInput)).toThrow(
      expect.objectContaining({ code: 'INVALID_WRITE_POLICY' }),
    );
  });

  it('rejects nested create permissions for update operations and incomplete upserts', () => {
    expect(() =>
      buildWritePolicy({
        relations: {
          tasks: { create: { relations: { owner: { update: {} } } } },
        },
      }),
    ).toThrow(/Unsupported/);
    expect(() =>
      buildUpsertWritePolicy({ create: {} } as UpsertWritePolicyInput),
    ).toThrow();
    expect(() => buildUpsertWritePolicy((u) => u.create((w) => w))).toThrow();
    expect(
      buildUpsertWritePolicy((u) =>
        u.create((w) => w.fields('id', 'name')).update((w) => w.fields('name')),
      ),
    ).toEqual(
      buildUpsertWritePolicy({
        create: { fields: ['id', 'name'] },
        update: { fields: ['name'] },
      }),
    );
  });

  it('rejects cycles, asynchronous and foreign callback results, and repeated declarations', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.relations = { tasks: { update: cyclic } };
    expect(() => buildWritePolicy(cyclic)).toThrow(/cycles/);
    expect(() =>
      buildWritePolicy(
        (async (w: WritePolicyBuilder) => w) as unknown as WritePolicyInput,
      ),
    ).toThrow(/synchronously/);
    expect(() =>
      buildWritePolicy((() => ({})) as unknown as WritePolicyInput),
    ).toThrow(/own builder/);
    expect(() => buildWritePolicy((w) => w.fields('a').fields('b'))).toThrow(
      /once/,
    );
    expect(() =>
      buildWritePolicy((w) =>
        w
          .relation('tasks', (r) => r.connect())
          .relation('tasks', (r) => r.delete()),
      ),
    ).toThrow(/once/);
    expect(() =>
      buildWritePolicy((w) =>
        w.relation('tasks', (r) => r.update((t) => t).update((t) => t)),
      ),
    ).toThrow(/once/);
    expect(() =>
      buildWritePolicy((w) =>
        w.relation('tasks', (r) => {
          w.relation('tasks', (other) => other.delete());
          return r.connect();
        }),
      ),
    ).toThrow(/once/);
    expect(() =>
      buildUpsertWritePolicy((u) =>
        u
          .create((w) => w)
          .create((w) => w)
          .update((w) => w),
      ),
    ).toThrow(/once/);
    expect(() =>
      buildWritePolicy((w) =>
        w.relation('tags', (r) =>
          r.connect((e) =>
            e.through((t) => t.fields('role')).through((t) => t),
          ),
        ),
      ),
    ).toThrow(/once/);
  });
});

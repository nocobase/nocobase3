import { describe, expect, it } from 'vitest';
import { normalizeRepositoryPolicy } from '../../../../src/repository/policy/normalize.js';

describe('normalizeRepositoryPolicy', () => {
  it('requires all top-level nodes and normalizes omitted whitelists to empty', () => {
    const policy = normalizeRepositoryPolicy({
      read: { scope: { tenantId: 'T1' } },
      create: { scope: true, defaults: { tenantId: 'T1' } },
      update: { scope: true },
      delete: { scope: true },
    });

    expect(policy.read).toMatchObject({
      fields: [],
      relations: {},
    });
    expect(policy.create).toMatchObject({
      fields: [],
      relations: {},
      defaults: { tenantId: 'T1' },
    });
    expect(Object.isFrozen(policy)).toBe(true);
  });

  it('builds a scope from the existing Filter Builder callback', () => {
    const policy = normalizeRepositoryPolicy({
      read: {
        scope: (filter) =>
          filter.and([
            filter.string('tenantId').eq('T1'),
            filter.string('status').eq('draft'),
          ]),
        fields: ['id'],
      },
      create: { scope: true },
      update: { scope: true },
      delete: { scope: true },
    });

    expect(policy.read).toMatchObject({
      scope: {
        kind: 'filter',
        version: 1,
        root: {
          kind: 'group',
          logic: 'and',
          items: [
            { kind: 'condition', path: ['tenantId'], operator: '$eq' },
            { kind: 'condition', path: ['status'], operator: '$eq' },
          ],
        },
      },
      fields: ['id'],
    });
  });

  it('rejects missing scopes and duplicate fields', () => {
    expect(() =>
      normalizeRepositoryPolicy({
        read: { scope: true, fields: ['id', 'id'] },
        create: { scope: true },
        update: { scope: true },
        delete: { scope: true },
      }),
    ).toThrowError(/fields must not contain duplicates/);

    expect(() =>
      normalizeRepositoryPolicy({
        read: {} as never,
        create: { scope: true },
        update: { scope: true },
        delete: { scope: true },
      }),
    ).toThrowError(/scope is required/);
  });

  it('requires scope on relation read nodes', () => {
    expect(() =>
      normalizeRepositoryPolicy({
        read: {
          scope: true,
          relations: { tasks: { fields: ['id'] } as never },
        },
        create: { scope: true },
        update: { scope: true },
        delete: { scope: true },
      }),
    ).toThrowError(/scope is required/);
  });

  it('refuses a scope that reaches outside this collection', () => {
    const withScope = (scope: unknown) => () =>
      normalizeRepositoryPolicy({
        read: { scope } as never,
        create: { scope: true },
        update: { scope: true },
        delete: { scope: true },
      });

    expect(
      withScope({
        kind: 'filter',
        version: 1,
        root: {
          kind: 'group',
          logic: 'and',
          items: [{ kind: 'relation', path: ['owner'], quantifier: 'exists' }],
        },
      }),
    ).toThrowError(/must not traverse relations/);

    expect(
      withScope({
        kind: 'filter',
        version: 1,
        root: {
          kind: 'group',
          logic: 'and',
          items: [
            {
              kind: 'condition',
              path: ['owner', 'tenantId'],
              operator: '$eq',
              value: 'T1',
            },
          ],
        },
      }),
    ).toThrowError(/direct Field/);

    // The shorthand spelling of the same thing. It keeps the dotted name as
    // one segment, so a length check alone would have let it through to fail
    // much later as an unknown field.
    expect(withScope({ 'owner.tenantId': 'T1' })).toThrowError(/direct Field/);

    expect(
      withScope({
        kind: 'filter',
        version: 1,
        root: {
          kind: 'group',
          logic: 'and',
          items: [
            {
              kind: 'condition',
              path: ['metadata'],
              operator: '$jsonEq',
              value: 1,
            },
          ],
        },
      }),
    ).toThrowError(/JSON operator/);
  });

  it('freezes the whole scope AST, not only its root', () => {
    const policy = normalizeRepositoryPolicy({
      read: { scope: { tenantId: 'T1' } },
      create: { scope: true },
      update: { scope: true },
      delete: { scope: true },
    });
    const scope = (
      policy.read as {
        scope: { root: { items: readonly unknown[] } };
      }
    ).scope;

    // explainPolicy hands this out; a caller who mutated it would change the
    // effective range of every later query on that repository.
    expect(Object.isFrozen(scope)).toBe(true);
    expect(Object.isFrozen(scope.root)).toBe(true);
    expect(Object.isFrozen(scope.root.items)).toBe(true);
    expect(Object.isFrozen(scope.root.items[0])).toBe(true);
  });

  it('copies and freezes a Date used as a create default', () => {
    const supplied = new Date('2020-01-01T00:00:00.000Z');
    const policy = normalizeRepositoryPolicy({
      read: { scope: true },
      create: { scope: true, defaults: { startedAt: supplied } },
      update: { scope: true },
      delete: { scope: true },
    });
    const defaults = (policy.create as { defaults: Record<string, unknown> })
      .defaults;
    const startedAt = defaults.startedAt as Date;

    expect(startedAt).not.toBe(supplied);
    expect(startedAt.toISOString()).toBe(supplied.toISOString());
    expect(Object.isFrozen(startedAt)).toBe(true);
  });
});

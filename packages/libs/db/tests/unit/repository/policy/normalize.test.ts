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
});

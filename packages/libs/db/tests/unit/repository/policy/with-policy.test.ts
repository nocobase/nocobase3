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
});

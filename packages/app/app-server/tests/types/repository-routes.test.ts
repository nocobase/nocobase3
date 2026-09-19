import type { RepositoryPolicy } from '@nocobase/db';
import { expectTypeOf, it } from 'vitest';
import type {
  RepositoryApiActions,
  RepositoryApiExposure,
} from '../../src/router/index.js';

const policy: RepositoryPolicy = {
  read: true,
  create: { scope: true, fields: ['title'] },
  update: { scope: true, fields: ['title'] },
  delete: false,
};

it('uses configuration objects and limits options to the relevant action', () => {
  const actions: RepositoryApiActions = {
    findMany: { maxLimit: 100 },
    findOne: {},
    count: {},
    exists: {},
    aggregate: {},
    groupBy: {},
    deleteOne: {},
    createOne: {},
    updateOne: {},
  };
  expectTypeOf(actions).toMatchTypeOf<RepositoryApiActions>();
  const invalid = () => {
    // @ts-expect-error boolean action flags are unsupported
    const flag: RepositoryApiActions = { count: true };
    // @ts-expect-error disabled actions must be omitted
    const disabled: RepositoryApiActions = { exists: false };
    // @ts-expect-error empty configurations must not accept arbitrary options
    const count: RepositoryApiActions = { count: { maxLimit: 10 } };
    const find: RepositoryApiActions = {
      // @ts-expect-error a Policy belongs to the exposure, not to an action
      findMany: { policy },
    };
    const written: RepositoryApiActions = {
      // @ts-expect-error writePolicy is no longer part of a route declaration
      updateOne: { writePolicy: false },
    };
    // @ts-expect-error every exposure declares a Policy
    const unpoliced: RepositoryApiExposure = { name: 'projects', actions };
    const root: RepositoryApiExposure = {
      name: 'projects',
      policy,
      actions,
      // @ts-expect-error maxLimit belongs to findMany
      maxLimit: 100,
    };
    const array: RepositoryApiExposure = {
      name: 'projects',
      policy,
      // @ts-expect-error arrays are unsupported
      actions: ['count'],
    };
    void [flag, disabled, count, find, written, unpoliced, root, array];
  };
  void invalid;
});

it('types a Policy function against the principal the resolver returns', () => {
  const scoped: RepositoryApiExposure<{ tenantId: string }> = {
    name: 'projects',
    policy: (principal) => ({
      read: { scope: { tenantId: principal.tenantId }, fields: ['id'] },
      create: false,
      update: false,
      delete: false,
    }),
    actions: { findMany: {} },
  };
  expectTypeOf(scoped.policy).toMatchTypeOf<
    RepositoryPolicy | ((principal: { tenantId: string }) => RepositoryPolicy)
  >();
});

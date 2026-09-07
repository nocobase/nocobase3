import { expectTypeOf, it } from 'vitest';
import type {
  RepositoryApiActions,
  RepositoryApiExposure,
} from '../../src/router/index.js';

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
    updateOne: {
      writePolicy: (allow) =>
        allow.relation('tasks', (task) =>
          task.update((w) =>
            w.fields('title').relation('assignee', (a) => a.connect()),
          ),
        ),
    },
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
      // @ts-expect-error read actions cannot grant writes
      findMany: { writePolicy: false },
    };
    const deletion: RepositoryApiActions = {
      // @ts-expect-error deleteOne has no nested values
      deleteOne: { writePolicy: false },
    };
    const policy: RepositoryApiActions = {
      // @ts-expect-error wildcards via true are unsupported
      updateOne: { writePolicy: true },
    };
    const root: RepositoryApiExposure = {
      name: 'projects',
      actions,
      // @ts-expect-error maxLimit belongs to findMany
      maxLimit: 100,
    };
    const array: RepositoryApiExposure = {
      name: 'projects',
      // @ts-expect-error arrays are unsupported
      actions: ['count'],
    };
    void [flag, disabled, count, find, deletion, policy, root, array];
  };
  void invalid;
});

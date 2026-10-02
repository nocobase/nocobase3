import type { TestDatabaseProvisioner } from '@nocobase/db/testing';
import { sqlite } from './index.js';

/**
 * Every Database Manager opened on `:memory:` starts from an empty database,
 * so there is nothing to create or drop: isolation comes from the manager.
 */
export const testDatabaseProvisioner: TestDatabaseProvisioner = {
  dialect: 'sqlite',
  provision: () =>
    Promise.resolve({
      connection: sqlite({ filename: ':memory:' }),
      drop: () => Promise.resolve(),
    }),
};

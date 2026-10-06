// The migration against a real database: up creates every collection with
// its metadata, and down removes all of them again.
import { describeMigration } from '@nocobase/app-testing/server';
import { expect } from 'vitest';

import { COLLECTIONS } from '../server/scope.js';
import { migrations } from './fixtures.js';

const names = Object.values(COLLECTIONS);

describeMigration('202610010001_office_flows_example_create_collections', {
  sources: migrations,
  up: async ({ expectCollection }) => {
    expect(names).toHaveLength(16);
    for (const name of names) await expectCollection(name).toExist();
    // The log and the traces are unique where a retry must not write twice.
    await expectCollection(COLLECTIONS.transitions).toHaveIndex(
      ['lifecycle', 'recordId', 'version'],
      { unique: true },
    );
    // The request key is unique per record; where the dialect has partial
    // indexes, only among entries that carry one.
    await expectCollection(COLLECTIONS.transitions).toHaveIndex(
      ['lifecycle', 'recordId', 'requestId'],
      { unique: true },
    );
    await expectCollection(COLLECTIONS.traces).toHaveIndex(['key'], {
      unique: true,
    });
  },
  down: async ({ expectCollection }) => {
    for (const name of names) await expectCollection(name).not.toExist();
  },
});

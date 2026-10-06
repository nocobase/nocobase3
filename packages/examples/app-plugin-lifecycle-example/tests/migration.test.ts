// The migration against a real database: up creates the example records and
// the lifecycle log with their metadata, and down removes all of them.
import { describeMigration } from '@nocobase/app-testing/server';

import { migrations } from './fixtures.js';

const COLLECTIONS = [
  'lifecycleExampleTickets',
  'lifecycleExampleExpenses',
  'lifecycleExampleTransitions',
  'lifecycleExampleEffectRuns',
];

describeMigration('202610010001_lifecycle_example_create_collections', {
  sources: migrations,
  up: async ({ expectCollection }) => {
    for (const name of COLLECTIONS) await expectCollection(name).toExist();
    for (const name of ['lifecycleExampleTickets', 'lifecycleExampleExpenses'])
      await expectCollection(name).toHaveField('lifecycleVersion', {
        nullable: false,
      });
    await expectCollection('lifecycleExampleTransitions').toHaveIndex(
      ['lifecycle', 'recordId', 'version'],
      { unique: true },
    );
    // The request key is unique per record; where the dialect has partial
    // indexes, only among entries that carry one.
    await expectCollection('lifecycleExampleTransitions').toHaveIndex(
      ['lifecycle', 'recordId', 'requestId'],
      { unique: true },
    );
  },
  down: async ({ expectCollection }) => {
    for (const name of COLLECTIONS) await expectCollection(name).not.toExist();
  },
});

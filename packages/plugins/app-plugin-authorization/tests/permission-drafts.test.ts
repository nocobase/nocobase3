import { expect, it } from 'vitest';
import { fromSet, toInput } from '../client/pages/permission-sets/drafts.js';
import type { PermissionSet } from '../client/authorization-client.js';

it('preserves underlying policies when editing a permission set title', () => {
  const set: PermissionSet = {
    key: 'sales',
    title: 'Sales',
    grants: [
      {
        resource: { type: 'database.collection', id: 'orders' },
        actions: [
          {
            action: 'read',
            policy: {
              type: 'database',
              fields: ['id', 'amount'],
              recordAccess: ['recordsIOwn', 'recordsICreated'],
              relations: {
                customer: { fields: ['name'], recordAccess: ['allRecords'] },
              },
            },
          },
          { action: 'create', policy: { type: 'database', fields: '*' } },
        ],
      },
      {
        resource: { type: 'custom', id: 'extension' },
        actions: [
          {
            action: 'run',
            policy: { type: 'custom', nested: { enabled: true } },
          },
        ],
      },
    ],
  };
  const draft = fromSet(set);
  expect(toInput(draft)).toEqual(set);
  draft.title = 'Renamed sales';
  expect(toInput(draft)).toEqual({ ...set, title: 'Renamed sales' });
});

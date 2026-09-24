import { expect, it } from 'vitest';
import type { PermissionSet } from '../../client/authorization-client.js';
import { fromSet, toInput } from '../../client/pages/permission-sets/drafts.js';

const databasePolicy: PermissionSet = {
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
  ],
};

const customPolicy: PermissionSet = {
  key: 'extension',
  title: 'Extension',
  grants: [
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

// A policy key the editor does not know, such as `futureConstraint`, survives.
const compositePolicy: PermissionSet = {
  key: 'dispatcher',
  title: 'Dispatcher',
  grants: [
    {
      resource: { type: 'composite', id: 'tasks' },
      actions: [
        {
          action: 'assign',
          policy: {
            type: 'composite',
            scopes: { tasks: 'own', people: 'department' },
            futureConstraint: { keep: true },
          },
        },
      ],
    },
  ],
};

const translatedTitle: PermissionSet = {
  key: 'reader',
  title: { key: 'roles.reader', ns: 'example' },
  grants: [],
};

it.each([
  ['a database policy with relations', databasePolicy],
  ['a custom policy', customPolicy],
  ['a composite policy with an unknown key', compositePolicy],
  ['a translated title', translatedTitle],
])('round-trips %s, and a new title changes nothing else', (_name, set) => {
  const draft = fromSet(set, () => 'Shown title');
  expect(toInput(draft)).toEqual(set);
  expect(toInput({ ...draft, title: 'Renamed' })).toEqual({
    ...set,
    title: 'Renamed',
  });
});

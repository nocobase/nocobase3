import type { LocaleResource } from '@nocobase/i18n';

const enUS = {
  title: 'Authorization example',
  intro:
    'Every task here is owned by whoever created it, and the seeded Permission Set grants each signed-in user the `recordsIOwn` record access, so an ordinary account reads, updates and deletes only its own rows.',
  intro2:
    'A superuser bypasses grants entirely and sees everyone’s tasks. Adding a task goes through the plugin’s own route, which stamps the owner from the principal rather than from the request body.',
  newTask: 'What needs doing?',
  add: 'Add',
  done: 'Done',
  reopen: 'Reopen',
  delete: 'Delete',
  loading: 'Loading tasks…',
  empty: 'No tasks yet.',
  forbidden: 'You have no grant on this collection',
  error: 'Something went wrong.',
  statusOpen: 'Open',
  statusDone: 'Done',
  owner: 'Owner',
};

export type AuthorizationExampleResource = LocaleResource<typeof enUS>;
export default enUS;

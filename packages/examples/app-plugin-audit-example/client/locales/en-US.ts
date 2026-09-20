import type { LocaleResource } from '@nocobase/i18n';
const enUS = {
  title: 'Customer audit example',
  description:
    'Manage your customers and view their operation history. Phone numbers in the history are masked.',
  name: 'Customer name',
  phone: 'Phone number',
  actions: 'Actions',
  create: 'Create customer',
  edit: 'Edit',
  save: 'Save changes',
  cancel: 'Cancel',
  delete: 'Delete',
  logs: 'Operation history',
  allLogs: 'Show all history',
  empty: 'No customers yet.',
  noLogs: 'Select operation history to load records.',
  saved: 'Customer saved.',
  deleted: 'Customer deleted. History is retained.',
  loadFailed: 'Could not load customers.',
  saveFailed:
    'The change could not be saved. Refresh the customer before retrying.',
  logsFailed: 'Could not load history. Do not repeat the customer operation.',
  action: {
    created: 'Created customer',
    updated: 'Updated customer',
    deleted: 'Deleted customer',
  },
};
export type AuditExampleResource = LocaleResource<typeof enUS>;
export default enUS;

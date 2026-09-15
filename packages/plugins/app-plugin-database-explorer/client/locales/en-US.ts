import type { LocaleResource } from '@nocobase/i18n';

const enUS = {
  nav: {
    databaseExplorer: 'Database Explorer',
  },
  page: {
    title: 'Database Explorer',
    description:
      'Browse the connections this application is configured with, the collections on each one, and their fields. Nothing here can be changed.',
  },
  sections: {
    connections: 'Connections',
    collections: 'Collections',
    detail: 'Collection',
  },
  tabs: {
    fields: 'Fields',
    columns: 'Physical columns',
  },
  fields: {
    name: 'Field',
    type: 'Type',
    nullable: 'Nullable',
    key: 'Key',
    default: 'Default',
    target: 'Relation target',
  },
  columns: {
    name: 'Column',
    nativeType: 'Native type',
    nullable: 'Nullable',
    length: 'Length',
    collation: 'Collation',
  },
  schemaManagement: {
    managed: 'managed',
    external: 'external',
  },
  labels: {
    default: 'default',
    primaryKey: 'primary key',
    unique: 'unique',
    warnings: 'Resolution warnings',
    yes: 'Yes',
    no: 'No',
  },
  actions: {
    searchCollections: 'Search collections',
  },
  states: {
    loading: 'Loading',
  },
  empty: {
    connections: 'No connections are configured.',
    collections: 'No collections on this connection.',
    detail: 'Select a collection to see its fields.',
    fields: 'This collection declares no fields.',
    columns: 'This collection has no physical columns.',
  },
  errors: {
    unknown: 'Something went wrong.',
  },
};

/**
 * English is the source of truth for this plugin's locale shape.
 */
export type DatabaseExplorerResource = LocaleResource<typeof enUS>;

export default enUS;

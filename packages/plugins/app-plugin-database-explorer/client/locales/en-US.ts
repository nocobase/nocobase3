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
    truncated: 'This connection has more collections than the page will load.',
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
    databaseUnavailable: 'This application is configured without a database.',
    forbidden: 'You do not have access to the Database Explorer.',
    connectionNotFound: 'This connection is not configured.',
    connectionUnavailable:
      'This application cannot open this connection. Its driver may not be registered.',
    connectionUnreachable: 'This connection could not be read.',
    schemaReadDenied: 'The database account may not read this schema.',
    collectionNotFound: 'This collection does not exist on this connection.',
    invalidListOptions:
      'The listing options are not valid for this connection.',
    invalidCursor:
      'That page of results has expired. Search again from the start.',
  },
};

/**
 * English is the source of truth for this plugin's locale shape.
 */
export type DatabaseExplorerResource = LocaleResource<typeof enUS>;

export default enUS;

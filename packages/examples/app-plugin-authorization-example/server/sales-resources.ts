import { buildFilter } from '@nocobase/repository-input';
import {
  BusinessResourceReference,
  defineBusinessResource,
  type BusinessActions,
  type BusinessResource,
} from '@nocobase/authorization/core';
import { defineDatabasePermission } from '@nocobase/app-plugin-authorization';
import { label, PROJECTS, QUOTES, ORDERS } from '../catalog.js';
import type { Project, Quote, Order } from './sales-records.js';

/** Page ids, as the client routes declare them in `authz`. */
export const projectPage = { name: 'example.sales.projects' } as const;
export const quotePage = { name: 'example.sales.quotes' } as const;
export const orderPage = { name: 'example.sales.orders' } as const;

const projectFields = [
  'id',
  'title',
  'region',
  'ownerId',
  'confidential',
  'notes',
] as const;
const quoteFields = [
  'id',
  'projectId',
  'preparedById',
  'preparedByName',
  'title',
  'amount',
  'status',
  'notes',
] as const;
const orderFields = [
  'id',
  'projectId',
  'quoteId',
  'title',
  'status',
  'deliveryReference',
] as const;
const projectPermission = defineDatabasePermission((permission) =>
  permission
    .collection<Project>(PROJECTS)
    .title(label('sales.projects'))
    .read(projectFields),
);
const quotePermission = defineDatabasePermission((permission) =>
  permission
    .collection<Quote>(QUOTES)
    .title(label('sales.quotes'))
    .read(quoteFields),
);
const orderPermission = defineDatabasePermission((permission) =>
  permission
    .collection<Order>(ORDERS)
    .title(label('sales.orders'))
    .read((read) =>
      read
        .fields(...orderFields)
        .relation('deliveryTeam', (team) => team.fields('id', 'title'))
        .relation('checks', (checks) => checks.fields('id', 'title', 'done'))
        .relation('collaborators', (team) => team.fields('id', 'title')),
    ),
);

const activeTeams = {
  key: 'customFilter',
  params: {
    filter: buildFilter((filter) => filter.boolean('active').isTrue()),
  },
};
const deliveryRelations = orderPermission.update((update) =>
  update
    .relation('deliveryTeam', (team) =>
      team.recordAccess(activeTeams).connect().disconnect(),
    )
    .relation('checks', (checks) =>
      checks
        .create((create) => create.fields('id', 'title', 'done'))
        .update((update) => update.fields('title', 'done'))
        .upsert((upsert) =>
          upsert
            .create((create) => create.fields('id', 'title', 'done'))
            .update((update) => update.fields('title', 'done')),
        )
        .delete(),
    )
    .relation('collaborators', (team) =>
      team
        .recordAccess(activeTeams)
        .connect((edge) => edge.through((through) => through.fields('note')))
        .set((edge) => edge.through((through) => through.fields('note')))
        .disconnect(),
    ),
);

/**
 * The object form of a business resource: the same data
 * `defineBusinessResource` builds, written out directly.
 */
export const projectResource: BusinessResource = {
  name: 'example.sales.projects',
  title: label('sales.projects'),
  group: 'example.sales',
  actions: [
    {
      name: 'view',
      title: label('sales.view'),
      ...projectPermission.bind('projects').build(),
    },
    {
      name: 'edit',
      title: label('sales.editProject'),
      ...projectPermission.update(['title', 'notes']).bind('projects').build(),
    },
  ],
};

export const projectReference: BusinessResourceReference<BusinessActions> =
  new BusinessResourceReference(projectResource);

export const quoteResource = defineBusinessResource(
  'example.sales.quotes',
  (resource) =>
    resource
      .group('example.sales')
      .title(label('sales.quotes'))
      .action('view', (action) =>
        action.title(label('sales.view')).grant('quotes', quotePermission),
      )
      .action('edit', (action) =>
        action
          .title(label('sales.editQuote'))
          .grant('quotes', quotePermission.update(['amount', 'notes'])),
      )
      .action('submit', (action) =>
        action
          .title(label('sales.submit'))
          .grant('projects', projectPermission, {
            title: label('sales.submitScopes.projects'),
          })
          .grant('quotes', quotePermission.update(['status']), {
            title: label('sales.submitScopes.quotes'),
          }),
      ),
);

export const orderResource = defineBusinessResource(
  'example.sales.orders',
  (resource) =>
    resource
      .group('example.delivery')
      .title(label('sales.orders'))
      .action('view', (action) =>
        action.title(label('sales.view')).grant('orders', orderPermission),
      )
      .action('manageRelations', (action) =>
        action
          .title(label('sales.manageRelations'))
          .grant('orders', deliveryRelations),
      )
      .action('deliver', (action) =>
        action
          .title(label('sales.deliver'))
          .grant(
            'orders',
            orderPermission.update(['status', 'deliveryReference']),
          ),
      ),
);

export const salesGroups = [
  { name: 'example.sales', title: label('sales.group') },
  { name: 'example.delivery', title: label('sales.delivery') },
] as const;
export const salesCollections = [
  {
    name: PROJECTS,
    title: label('sales.projects'),
    actions: ['read', 'update'],
  },
  { name: QUOTES, title: label('sales.quotes'), actions: ['read', 'update'] },
  { name: ORDERS, title: label('sales.orders'), actions: ['read', 'update'] },
];
export const salesResources: readonly BusinessResource[] = [
  projectResource,
  quoteResource.build(),
  orderResource.build(),
];

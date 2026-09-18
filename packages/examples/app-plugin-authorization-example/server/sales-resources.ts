import { businessResource } from '@nocobase/authorization/core';
import {
  authorizationPage,
  databaseCollection,
} from '@nocobase/app-plugin-authorization';
import { label, PROJECTS, QUOTES, ORDERS } from '../catalog.js';
import type { Project, Quote, Order } from './sales-records.js';

export const projectPage = authorizationPage('example.sales.projects', {
  title: label('sales.projects'),
});
export const quotePage = authorizationPage('example.sales.quotes', {
  title: label('sales.quotes'),
});
export const orderPage = authorizationPage('example.sales.orders', {
  title: label('sales.orders'),
});

const projectsCollection = databaseCollection(PROJECTS)
  .typed<Project>()
  .title(label('sales.projects'))
  .actions('read', 'update');
const projects = projectsCollection.reference();
const quotesCollection = databaseCollection(QUOTES)
  .typed<Quote>()
  .title(label('sales.quotes'))
  .actions('read', 'update');
const quotes = quotesCollection.reference();
const ordersCollection = databaseCollection(ORDERS)
  .typed<Order>()
  .title(label('sales.orders'))
  .actions('read', 'update');
const orders = ordersCollection.reference();

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
const projectScope = projects
  .scope('projects', { title: label('sales.projects') })
  .read(projectFields);
const quoteScope = quotes
  .scope('quotes', { title: label('sales.quotes') })
  .read(quoteFields);
const orderScope = orders
  .scope('orders', { title: label('sales.orders') })
  .read(orderFields);

export const projectResource = businessResource('example.sales.projects', {
  group: 'example.sales',
  title: label('sales.projects'),
})
  .action('view', { title: label('sales.view') }, (action) =>
    action.grant(projectScope),
  )
  .action('edit', { title: label('sales.editProject') }, (action) =>
    action.grant(projectScope.update(['title', 'notes'])),
  );

export const quoteResource = businessResource('example.sales.quotes', {
  group: 'example.sales',
  title: label('sales.quotes'),
})
  .action('view', { title: label('sales.view') }, (action) =>
    action.grant(quoteScope),
  )
  .action('edit', { title: label('sales.editQuote') }, (action) =>
    action.grant(quoteScope.update(['amount', 'notes'])),
  )
  .action('submit', { title: label('sales.submit') }, (action) =>
    action
      .grant(
        projects
          .scope('projects', { title: label('sales.submitScopes.projects') })
          .read(projectFields),
      )
      .grant(
        quotes
          .scope('quotes', { title: label('sales.submitScopes.quotes') })
          .read(quoteFields)
          .update(['status']),
      ),
  );

export const orderResource = businessResource('example.sales.orders', {
  group: 'example.delivery',
  title: label('sales.orders'),
})
  .action('view', { title: label('sales.view') }, (action) =>
    action.grant(orderScope),
  )
  .action('deliver', { title: label('sales.deliver') }, (action) =>
    action.grant(orderScope.update(['status', 'deliveryReference'])),
  );

export const salesGroups = [
  { name: 'example.sales', category: 'business', title: label('sales.group') },
  {
    name: 'example.delivery',
    category: 'business',
    title: label('sales.delivery'),
  },
] as const;
export const salesPages = [projectPage, quotePage, orderPage];
export const salesCollections = [
  projectsCollection,
  quotesCollection,
  ordersCollection,
];
export const salesResources = [projectResource, quoteResource, orderResource];
export { quotesCollection };

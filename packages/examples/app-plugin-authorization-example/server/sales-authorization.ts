import { type AppAuthorizationService } from '@nocobase/app-plugin-authorization';
import type { DatabaseManager } from '@nocobase/db';
import { label } from '../catalog.js';
import {
  resolveOwnedSalesRecords,
  resolveRegionalSalesRecords,
  resolvePublicSalesRecords,
} from './sales-scopes.js';
export { PROJECTS, QUOTES, ORDERS } from '../catalog.js';

export function registerSalesAuthorization(
  authz: AppAuthorizationService,
  database: DatabaseManager,
): void {
  authz.resourceGroups.add({
    name: 'example.sales',
    category: 'business',
    title: label('sales.group'),
  });
  authz.resourceGroups.add({
    name: 'example.delivery',
    category: 'business',
    title: label('sales.delivery'),
  });

  authz.pages.add({
    name: 'example.sales.projects',
    title: label('sales.projects'),
    actions: ['access'],
  });
  authz.pages.add({
    name: 'example.sales.quotes',
    title: label('sales.quotes'),
    actions: ['access'],
  });
  authz.pages.add({
    name: 'example.sales.orders',
    title: label('sales.orders'),
    actions: ['access'],
  });

  authz.db.collections.add({
    name: 'authorizationExampleProjects',
    title: label('sales.projects'),
    actions: ['read', 'update'],
  });
  authz.db.collections.add({
    name: 'authorizationExampleQuotes',
    title: label('sales.quotes'),
    actions: ['read', 'update'],
  });
  authz.db.collections.add({
    name: 'authorizationExampleOrders',
    title: label('sales.orders'),
    actions: ['read', 'update'],
  });

  authz.resources.add({
    name: 'example.sales.projects',
    title: label('sales.projects'),
    group: 'example.sales',
    actions: [
      {
        name: 'view',
        title: label('sales.view'),
        scopes: {
          projects: {
            title: label('sales.projects'),
            resource: {
              type: 'database.collection',
              id: 'authorizationExampleProjects',
            },
          },
        },
        grants: [
          authz.pages.grant('example.sales.projects', ['access']),
          authz.db.grant('authorizationExampleProjects', {
            read: {
              scope: 'projects',
              fields: {
                output: [
                  'id',
                  'title',
                  'region',
                  'ownerId',
                  'confidential',
                  'notes',
                ],
              },
            },
          }),
        ],
      },
      {
        name: 'edit',
        title: label('sales.editProject'),
        scopes: {
          projects: {
            title: label('sales.projects'),
            resource: {
              type: 'database.collection',
              id: 'authorizationExampleProjects',
            },
          },
        },
        grants: [
          authz.db.grant('authorizationExampleProjects', {
            read: {
              scope: 'projects',
              fields: {
                output: [
                  'id',
                  'title',
                  'region',
                  'ownerId',
                  'confidential',
                  'notes',
                ],
              },
            },
            update: {
              scope: 'projects',
              fields: { input: ['title', 'notes'] },
            },
          }),
        ],
      },
    ],
  });

  authz.resources.add({
    name: 'example.sales.quotes',
    title: label('sales.quotes'),
    group: 'example.sales',
    actions: [
      {
        name: 'view',
        title: label('sales.view'),
        scopes: {
          quotes: {
            title: label('sales.quotes'),
            resource: {
              type: 'database.collection',
              id: 'authorizationExampleQuotes',
            },
          },
        },
        grants: [
          authz.pages.grant('example.sales.quotes', ['access']),
          authz.db.grant('authorizationExampleQuotes', {
            read: {
              scope: 'quotes',
              fields: {
                output: [
                  'id',
                  'projectId',
                  'preparedById',
                  'preparedByName',
                  'title',
                  'amount',
                  'status',
                  'notes',
                ],
              },
            },
          }),
        ],
      },
      {
        name: 'edit',
        title: label('sales.editQuote'),
        scopes: {
          quotes: {
            title: label('sales.quotes'),
            resource: {
              type: 'database.collection',
              id: 'authorizationExampleQuotes',
            },
          },
        },
        grants: [
          authz.db.grant('authorizationExampleQuotes', {
            read: {
              scope: 'quotes',
              fields: {
                output: [
                  'id',
                  'projectId',
                  'preparedById',
                  'preparedByName',
                  'title',
                  'amount',
                  'status',
                  'notes',
                ],
              },
            },
            update: { scope: 'quotes', fields: { input: ['amount', 'notes'] } },
          }),
        ],
      },
      {
        name: 'submit',
        title: label('sales.submit'),
        scopes: {
          projects: {
            title: label('sales.submitScopes.projects'),
            resource: {
              type: 'database.collection',
              id: 'authorizationExampleProjects',
            },
          },
          quotes: {
            title: label('sales.submitScopes.quotes'),
            resource: {
              type: 'database.collection',
              id: 'authorizationExampleQuotes',
            },
          },
        },
        grants: [
          authz.db.grant('authorizationExampleProjects', {
            read: {
              scope: 'projects',
              fields: {
                output: [
                  'id',
                  'title',
                  'region',
                  'ownerId',
                  'confidential',
                  'notes',
                ],
              },
            },
          }),
          authz.db.grant('authorizationExampleQuotes', {
            read: {
              scope: 'quotes',
              fields: {
                output: [
                  'id',
                  'projectId',
                  'preparedById',
                  'preparedByName',
                  'title',
                  'amount',
                  'status',
                  'notes',
                ],
              },
            },
            update: { scope: 'quotes', fields: { input: ['status'] } },
          }),
        ],
      },
    ],
  });

  authz.resources.add({
    name: 'example.sales.orders',
    title: label('sales.orders'),
    group: 'example.delivery',
    actions: [
      {
        name: 'view',
        title: label('sales.view'),
        scopes: {
          orders: {
            title: label('sales.orders'),
            resource: {
              type: 'database.collection',
              id: 'authorizationExampleOrders',
            },
          },
        },
        grants: [
          authz.pages.grant('example.sales.orders', ['access']),
          authz.db.grant('authorizationExampleOrders', {
            read: {
              scope: 'orders',
              fields: {
                output: [
                  'id',
                  'projectId',
                  'quoteId',
                  'title',
                  'status',
                  'deliveryReference',
                ],
              },
            },
          }),
        ],
      },
      {
        name: 'deliver',
        title: label('sales.deliver'),
        scopes: {
          orders: {
            title: label('sales.orders'),
            resource: {
              type: 'database.collection',
              id: 'authorizationExampleOrders',
            },
          },
        },
        grants: [
          authz.db.grant('authorizationExampleOrders', {
            read: {
              scope: 'orders',
              fields: {
                output: [
                  'id',
                  'projectId',
                  'quoteId',
                  'title',
                  'status',
                  'deliveryReference',
                ],
              },
            },
            update: {
              scope: 'orders',
              fields: { input: ['status', 'deliveryReference'] },
            },
          }),
        ],
      },
    ],
  });

  authz.db.recordAccess.add({
    key: 'example.sales.prepared',
    collections: ['authorizationExampleQuotes'],
    title: label('sales.scope.prepared'),
    resolve: (context) => ({
      kind: 'condition',
      path: ['preparedById'],
      operator: '$eq',
      value: context.principal.id,
    }),
  });
  authz.db.recordAccess.add({
    key: 'example.sales.own',
    collections: ['authorizationExampleQuotes', 'authorizationExampleOrders'],
    title: label('sales.scope.own'),
    resolve: (context) => resolveOwnedSalesRecords(database, context),
  });
  authz.db.recordAccess.add({
    key: 'example.sales.region',
    collections: [
      'authorizationExampleProjects',
      'authorizationExampleQuotes',
      'authorizationExampleOrders',
    ],
    title: label('sales.scope.region'),
    resolve: (context) => resolveRegionalSalesRecords(database, context),
  });
  authz.db.recordAccess.add({
    key: 'example.sales.public',
    collections: [
      'authorizationExampleProjects',
      'authorizationExampleQuotes',
      'authorizationExampleOrders',
    ],
    title: label('sales.scope.public'),
    resolve: (context) => resolvePublicSalesRecords(database, context),
  });
}

import { permissionSet } from '@nocobase/authorization/permissions';
import { encodeAuthorizationTitle } from '@nocobase/authorization/core';
import {
  projectPage,
  quotePage,
  orderPage,
  projectResource,
  quoteResource,
  orderResource,
} from '../../server/sales-resources.js';
import { label } from '../../catalog.js';
import { timestamps, type SalesSeedContext } from './context.js';
const projects = projectResource.reference();
const quotes = quoteResource.reference();
const orders = orderResource.reference();

export const permissionSets = [
  permissionSet('example-sales-assistant')
    .title(label('roles.assistant'))
    .grant(
      projectPage.reference().access(),
      quotePage.reference().access(),
      orderPage.reference().access(),
    )
    .grant(projects.grant('view'), quotes.grant('view'), orders.grant('view'))
    .build(),
  permissionSet('example-sales-engineer')
    .title(label('roles.engineer'))
    .grant(
      projectPage.reference().access(),
      quotePage.reference().access(),
      orderPage.reference().access(),
    )
    .grant(
      projects.grant({
        view: { projects: 'example.sales.region' },
        edit: { projects: 'example.sales.region' },
      }),
      quotes.grant({
        view: { quotes: 'allRecords' },
        edit: { quotes: 'example.sales.region' },
        submit: {
          quotes: 'example.sales.prepared',
          projects: 'example.sales.region',
        },
      }),
      orders.grant('view'),
    )
    .build(),
  permissionSet('example-sales-manager')
    .title(label('roles.manager'))
    .grant(
      projectPage.reference().access(),
      quotePage.reference().access(),
      orderPage.reference().access(),
    )
    .grant(
      projects.grant({
        view: { projects: 'recordsIOwn' },
        edit: { projects: 'recordsIOwn' },
      }),
      quotes.grant({ view: { quotes: 'example.sales.own' } }),
      orders.grant('view'),
    )
    .build(),
  permissionSet('example-sales-delivery')
    .title(label('roles.delivery'))
    .grant(orderPage.reference().access())
    .grant(orders.grant('view', 'deliver'))
    .build(),
];
export function permissionSetRows(context: SalesSeedContext) {
  return permissionSets.map((set) => ({
    id: set.key,
    key: set.key,
    title: encodeAuthorizationTitle(set.title),
    grants: JSON.stringify(set.grants),
    ...timestamps(context),
  }));
}

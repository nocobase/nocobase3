import { defaultAccessRule } from '@nocobase/authorization/default-access';
import { sharingRule } from '@nocobase/authorization/sharing-rules';
import { restrictionRule } from '@nocobase/authorization/restriction-rules';
import { expectTypeOf, it } from 'vitest';
import { permissionSet } from '@nocobase/authorization/permissions';
import { authorizationPage } from '../server/pages-authorization.js';
import {
  BusinessResourceGroups,
  BusinessResources,
} from '@nocobase/authorization/core';
import { DatabaseAuthorizationService } from '../server/database/api.js';
import { RecordAccessPolicyRegistry } from '../server/database/record-access-registry.js';

// Compiled by test:types; invalid declarations must fail before registration.
function typeChecks() {
  const db = new DatabaseAuthorizationService(new RecordAccessPolicyRegistry());
  const quotes = db
    .collection('quotes')
    .typed<{ id: string; amount: number }>()
    .actions('read', 'update')
    .register();
  const own = quotes
    .recordAccess('own')
    .resolve(({ filter }) => {
      filter.eq('amount', 12);
      // @ts-expect-error amount is numeric
      filter.eq('amount', '12');
      // @ts-expect-error unknown field
      filter.eq('missing', 12);
      return true;
    })
    .register();
  const other = quotes
    .recordAccess('other')
    .resolve(() => true)
    .register();
  const scope = quotes
    .scope('quotes', { title: 'Quotes' })
    .options(own)
    .default(own)
    .read(['id']);
  scope.update(['amount']);
  // @ts-expect-error unknown field
  scope.update(['ammount']);
  // @ts-expect-error collection did not expose delete
  scope.delete();
  // @ts-expect-error default must be an allowed option
  scope.default(other);
  const projects = db
    .collection({ name: 'projects', fields: [{ name: 'id', type: 'string' }] })
    .actions('read')
    .register();
  projects.scope('projects', { title: 'Projects' }).read(['id']);
  // @ts-expect-error field names inferred from static schema
  projects.scope('projects', { title: 'Projects' }).read(['amount']);
  const projectOwn = projects
    .recordAccess('project-own')
    .resolve(() => true)
    .register();
  // @ts-expect-error policy belongs to a different table
  scope.options(projectOwn);
  const page = authorizationPage('quotes', { title: 'Quotes' }).reference();
  permissionSet('sales').grant(page.access());
  const groups = new BusinessResourceGroups();
  new BusinessResources(groups);
  const resource = groups
    .define('sales', { title: 'Sales' })
    .resource('quotes', { title: 'Quotes' })
    .action('view', { title: 'View' }, (action) => action.grant(scope))
    .action('edit', { title: 'Edit' }, (action) =>
      action.grant(
        quotes.scope('editable', { title: 'Editable' }).update(['amount']),
      ),
    )
    .action('access', { title: 'Read all' }, (action) =>
      action.grant({
        build: () => ({ grants: [db.grant('quotes', { read: {} })] }),
      }),
    )
    .register();
  groups
    .define('separate', { title: 'Separate' })
    .resource('separate', { title: 'Separate' })
    .action('view', { title: 'View' }, (action) =>
      // @ts-expect-error page grants are independent of business contributions
      action.grant(page.access()),
    );
  // @ts-expect-error an operation without named scopes has no configurable scopes
  resource.grant({ access: { quotes: 'own' } });
  resource.grant('view', 'edit');
  resource.grant({ view: { quotes: 'own' }, edit: { editable: 'any' } });
  defaultAccessRule(resource).scope('view', 'quotes', { type: 'all' });
  sharingRule('share', resource).scope('edit', 'editable', {
    type: 'records',
    ids: ['one'],
  });
  restrictionRule('restrict', resource).scope('view', 'quotes', {
    type: 'all',
  });
  // @ts-expect-error rule scope belongs to a different operation
  defaultAccessRule(resource).scope('view', 'editable', { type: 'all' });
  // @ts-expect-error an operation without named scopes cannot configure one
  sharingRule('share', resource).scope('access', 'quotes', {
    type: 'records',
    ids: [],
  });
  // @ts-expect-error nonexistent business action
  restrictionRule('restrict', resource).scope('submit', 'quotes', {
    type: 'all',
  });
  // @ts-expect-error unknown business operation
  resource.grant('submit');
  // @ts-expect-error scope belongs to a different operation
  resource.grant({ view: { editable: 'own' } });
  // @ts-expect-error unknown record access option
  resource.grant({ view: { quotes: 'other' } });
}
it('exposes a statically checked fluent contract', () => {
  expectTypeOf(typeChecks).toBeFunction();
});

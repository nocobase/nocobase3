import { it, expectTypeOf } from 'vitest';
import { defineAuthorizationResource } from '@nocobase/authorization/core';
import { defaultAccessRule } from '@nocobase/authorization/default-access';
import type { DatabaseActionGrant } from '../server/database/model.js';
import { defineDatabasePermission } from '../server/database/builders.js';

function typeChecks() {
  const invalidFields: DatabaseActionGrant = {
    // @ts-expect-error Grant fields accept a field list or '*', not directional objects.
    fields: { output: ['id'] },
  };
  void invalidFields;
  const own = {
    key: 'own',
    resources: [{ type: 'database.collection', id: 'quotes' }],
  } as const;
  const read = defineDatabasePermission((p) =>
    p
      .collection<{ id: string; amount: number }>('quotes')
      .read(['id'])
      .options(own),
  );
  read.update(['amount']);
  // @ts-expect-error Unknown row field.
  read.update(['ammount']);
  read.default({
    // @ts-expect-error Default must be an allowed option.
    key: 'other',
    resources: [{ type: 'database.collection', id: 'quotes' }],
  });
  const definition = defineAuthorizationResource('quotes', (r) =>
    r
      .group('sales')
      .action('view', (a) => a.grant('visible', read))
      .action('edit', (a) => a.grant('editable', read.update(['amount']))),
  );
  const reference = definition.reference();
  reference.grant({ view: { visible: 'own' } });
  // @ts-expect-error Unknown action.
  reference.grant('submit');
  // @ts-expect-error Scope belongs to another action.
  reference.grant({ view: { editable: 'own' } });
  // @ts-expect-error Unknown record access choice.
  reference.grant({ view: { visible: 'other' } });
  defaultAccessRule(reference).scope('view', 'visible', { type: 'all' });
  // @ts-expect-error Rule scope belongs to another action.
  defaultAccessRule(reference).scope('view', 'editable', { type: 'all' });
  // @ts-expect-error Duplicate resource action.
  definition.action('view', (a) => a.grant('rows', read));
  defineAuthorizationResource('duplicate', (r) =>
    r.group('sales').action('view', (a) =>
      // @ts-expect-error Duplicate binding key.
      a.grant('rows', read).grant('rows', read),
    ),
  );
}
it('retains action, binding and record access option inference', () => {
  expectTypeOf(typeChecks).toBeFunction();
});

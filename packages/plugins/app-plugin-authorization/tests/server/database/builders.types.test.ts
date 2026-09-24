import type { AppAuthorization } from '../../../server/index.js';
import { it, expectTypeOf } from 'vitest';
import {
  defineCompositeResource,
  selection,
} from '@nocobase/authorization/core';
import { defineDefaultAccessRule } from '@nocobase/authorization/default-access';
import type { DatabaseActionGrant } from '../../../server/database/model.js';
import { defineDatabasePermission } from '../../../server/database/builders.js';
import { recordAccess } from '../../../server/database/record-access.js';
import {
  ReadPermissionBuilder,
  WritePermissionBuilder,
} from '../../../server/database/permission-builders.js';

function typeChecks(authz: AppAuthorization) {
  const invalidFields: DatabaseActionGrant = {
    // @ts-expect-error Grant fields accept a field list or '*', not directional objects.
    fields: { output: ['id'] },
  };
  void invalidFields;
  const read = defineDatabasePermission((p) =>
    p
      .collection<{ id: string; amount: number }>('quotes')
      .read(['id'])
      .options(recordAccess.recordsIOwn),
  );
  read.update(['amount']);
  // @ts-expect-error Unknown row field.
  read.update(['ammount']);
  // @ts-expect-error Default must be an allowed option.
  read.default(recordAccess.allRecords);
  const definition = defineCompositeResource('quotes', (r) =>
    r
      .action('view', (a) => a.grant('visible', read))
      .action('edit', (a) => a.grant('editable', read.update(['amount']))),
  );
  const reference = definition.reference();
  authz.database.authorizeRepository({
    repository: 'quotes',
    resource: reference,
    actions: { findMany: 'view', updateOne: 'edit' },
  });
  authz.database.authorizeRepository({
    repository: 'quotes',
    resource: reference,
    actions: {
      // @ts-expect-error The binding must name an action declared by the composite.
      updateOne: 'submit',
    },
  });
  reference.grant({ view: { visible: 'recordsIOwn' } });
  reference.grant({ view: { visible: selection.records(['q1']) } });
  // @ts-expect-error Unknown action.
  reference.grant('submit');
  // @ts-expect-error Scope belongs to another action.
  reference.grant({ view: { editable: 'recordsIOwn' } });
  // @ts-expect-error Unknown record access choice.
  reference.grant({ view: { visible: 'other' } });
  defineDefaultAccessRule('d', reference).scope(
    'view',
    'visible',
    selection.all(),
  );
  defineDefaultAccessRule('d', reference).scope(
    'view',
    // @ts-expect-error Rule scope belongs to another action.
    'editable',
    selection.all(),
  );
  // @ts-expect-error Duplicate resource action.
  definition.action('view', (a) => a.grant('rows', read));
  defineCompositeResource('duplicate', (r) =>
    r.action('view', (a) =>
      // @ts-expect-error Duplicate binding key.
      a.grant('rows', read).grant('rows', read),
    ),
  );
}
// These calls are compiled but never executed: invalid chains must fail at the API boundary.
function relationTypeChecks(): void {
  const create = new WritePermissionBuilder<{ id: string }, true>({}, true);
  create.relation('customer', (relation) => {
    // @ts-expect-error Root create cannot update an existing relation target.
    relation.recordAccess('active').update((write) => write.fields('name'));
    return relation;
  });
  new ReadPermissionBuilder<{ id: string }>().relation<{ name: string }>(
    'customer',
    (read) => {
      // @ts-expect-error Target fields are checked against the supplied target row type.
      return read.fields('secret');
    },
  );
}

it('retains action, binding and record access option inference', () => {
  expectTypeOf(typeChecks).toBeFunction();
  expectTypeOf(relationTypeChecks).toBeFunction();
});

import { expect, it } from 'vitest';
import { defineDatabasePermission } from '../server/database/builders.js';
import {
  ReadPermissionBuilder,
  WritePermissionBuilder,
} from '../server/database/permission-builders.js';

it('builds independent Policy-shaped relation declarations with typed target fields', () => {
  const base = defineDatabasePermission((permission) =>
    permission
      .collection<{ id: string; amount: number }>('orders')
      .read((read) =>
        read
          .fields('id')
          .relation<{ id: string; name: string }>('customer', (customer) =>
            customer.fields('id', 'name'),
          ),
      ),
  );
  const edit = base.update((update) =>
    update
      .fields('amount')
      .relation('customer', (customer) =>
        customer.recordAccess('active').connect().disconnect(),
      )
      .relation('tags', (tags) =>
        tags.set((edge) => edge.through((through) => through.fields('note'))),
      ),
  );
  expect(base.build().actions).toHaveLength(1);
  expect(edit.build().actions[1].policy).toEqual({
    type: 'database',
    fields: ['amount'],
    relations: {
      customer: { recordAccess: ['active'], connect: {}, disconnect: {} },
      tags: { set: { through: { fields: ['note'] } } },
    },
  });
  const snapshot = edit.build();
  Reflect.set(snapshot.actions[1].policy!, 'relations', {});
  expect(edit.build().actions[1].policy?.relations).not.toEqual({});
});

it('rejects duplicate declarations and incomplete upserts', () => {
  expect(() =>
    new ReadPermissionBuilder()
      .relation('customer', (r) => r.fields('id'))
      .relation('customer', (r) => r),
  ).toThrow('Duplicate');
  expect(() =>
    new WritePermissionBuilder().relation('customer', (r) =>
      r.connect().connect(),
    ),
  ).toThrow('Duplicate');
  expect(() =>
    new WritePermissionBuilder().relation('items', (r) =>
      r.upsert((u) => u.create((c) => c.fields('id'))),
    ),
  ).toThrow('requires create and update');
});

// These calls are compiled but never executed: invalid chains must fail at the API boundary.
function typeChecks(): void {
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
void typeChecks;

it('serializes only the reference when a relation receives a record access definition', async () => {
  const { defineRecordAccess } = await import('@nocobase/authorization/core');
  const policy = defineRecordAccess('activeTeams', (access) =>
    access
      .resources({ type: 'database.collection', id: 'teams' })
      .resolve(() => true),
  );
  const permission = new WritePermissionBuilder()
    .relation('team', (team) => team.recordAccess(policy).connect())
    .build();
  expect(permission.relations).toEqual({
    team: { recordAccess: [{ key: 'activeTeams' }], connect: {} },
  });
  expect(JSON.parse(JSON.stringify(permission))).toEqual(permission);
});

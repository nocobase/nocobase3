import { expect, it } from 'vitest';
import {
  RelationPermissionResolver,
  mergeRelationPermissions,
} from '../server/database/relation-access.js';
import { condition } from '../server/database/scope.js';
import type { AuthorizationCollection } from '../server/database/model.js';
const orders: AuthorizationCollection = {
  name: 'orders',
  fields: ['id', 'customerId'],
  primaryKey: 'id',
  generatedPrimaryKey: false,
  relations: { customer: { target: 'customers' } },
};
const customers: AuthorizationCollection = {
  name: 'customers',
  fields: ['id', 'name', 'active'],
  primaryKey: 'id',
  generatedPrimaryKey: false,
};
const resolver = new RelationPermissionResolver({
  resolveCollection: async (name) =>
    name === 'customers' ? customers : undefined,
  resolveScope: async (_collection, rules) =>
    rules.includes('none') ? false : condition('active', '$eq', true),
});
it('resolves nested scope and validates target fields without a target CRUD grant', async () => {
  expect(
    await resolver.resolve(
      orders,
      { customer: { fields: ['name'], recordAccess: ['active'] } },
      'read',
    ),
  ).toMatchObject({
    customer: {
      fields: ['name'],
      scope: { collection: 'customers' },
      relations: {},
    },
  });
  await expect(
    resolver.resolve(orders, { customer: { fields: ['secret'] } }, 'read'),
  ).rejects.toThrow('Unknown permission field');
  await expect(
    resolver.resolve(orders, { missing: { connect: {} } }, 'update'),
  ).rejects.toThrow('Unknown permission relation');
  expect(
    await resolver.resolve(
      orders,
      { customer: { connect: {}, recordAccess: ['none'] } },
      'update',
    ),
  ).toEqual({});
});
it('rejects operations unavailable beneath root create and through payloads on to-one relations', async () => {
  await expect(
    resolver.resolve(orders, { customer: { delete: {} } }, 'create'),
  ).rejects.toThrow('Unsupported permission member');
  await expect(
    resolver.resolve(
      orders,
      { customer: { connect: { through: { fields: ['note'] } } } },
      'update',
    ),
  ).rejects.toThrow('many-to-many');
});
it('conservatively intersects target scopes before combining relation capabilities', async () => {
  const restricted = await resolver.resolve(
    orders,
    { customer: { recordAccess: ['active'], update: { fields: ['name'] } } },
    'update',
  );
  const broad = await resolver.resolve(
    orders,
    { customer: { connect: {} } },
    'update',
  );
  const merged = mergeRelationPermissions([restricted, broad], 'update');
  expect(merged.customer).toMatchObject({
    scope: { root: { items: [{ path: ['active'], value: true }] } },
    update: { fields: ['name'] },
    connect: { through: false },
  });
});

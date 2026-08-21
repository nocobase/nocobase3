import { describe, expect, it } from 'vitest';
import { Authorization, MemoryAuthorizationStore } from '../src/index.js';

function scalar() {
  return { type: 'scalar' as const };
}

function createAuthorization(relationWritable = true) {
  const store = new MemoryAuthorizationStore({
    permissionSets: [
      {
        key: 'customer-owner-reader',
        permissions: [
          {
            resource: 'customers',
            actions: [
              {
                action: 'read',
                outputFields: ['id', 'name', 'ownerId'],
                recordScope: [{ policy: 'recordsIOwn' }],
              },
            ],
          },
        ],
      },
      {
        key: 'customer-creator-reader',
        permissions: [
          {
            resource: 'customers',
            actions: [
              {
                action: 'read',
                outputFields: ['email', 'createdById'],
                recordScope: [{ policy: 'recordsICreated' }],
              },
            ],
          },
        ],
      },
      {
        key: 'order-manager',
        permissions: [
          {
            resource: 'orders',
            actions: [
              {
                action: 'read',
                outputFields: ['id', 'amount', 'ownerId', 'customer'],
                recordScope: [{ policy: 'recordsIOwn' }],
              },
              {
                action: 'update',
                inputFields: relationWritable
                  ? ['amount', 'customer']
                  : ['amount'],
                outputFields: ['id', 'amount', 'customer'],
                recordScope: [{ policy: 'recordsIOwn' }],
              },
              {
                action: 'approve',
                inputFields: ['approvalComment'],
                outputFields: ['id', 'status'],
                recordScope: [{ policy: 'recordsIOwn' }],
              },
            ],
          },
          {
            resource: 'customers',
            actions: [
              {
                action: 'read',
                outputFields: ['id', 'name', 'createdById'],
                recordScope: [{ policy: 'recordsICreated' }],
              },
            ],
          },
        ],
      },
    ],
    permissionSetGroups: [
      {
        key: 'sales',
        permissionSets: ['customer-owner-reader', 'customer-creator-reader'],
      },
    ],
    assignments: [
      {
        id: 'a1',
        subject: { type: 'user', id: 'alice' },
        target: { type: 'permissionSet', key: 'order-manager' },
      },
      {
        id: 'a2',
        subject: { type: 'user', id: 'bob' },
        target: { type: 'permissionSetGroup', key: 'sales' },
      },
    ],
  });
  const authorization = new Authorization({ store });
  authorization.resources.register({
    name: 'customers',
    actions: ['read', 'create', 'update', 'delete'],
    fields: {
      id: scalar(),
      name: scalar(),
      email: scalar(),
      ownerId: scalar(),
      createdById: scalar(),
    },
    attributes: { owner: 'ownerId', creator: 'createdById' },
  });
  authorization.resources.register({
    name: 'orders',
    actions: ['read', 'create', 'update', 'delete', 'approve'],
    fields: {
      id: scalar(),
      amount: scalar(),
      ownerId: scalar(),
      approvalComment: scalar(),
      status: scalar(),
      customer: { type: 'relation', target: 'customers', cardinality: 'one' },
    },
    attributes: { owner: 'ownerId' },
  });
  return authorization;
}

describe('Authorization', () => {
  it('unions fields and Record Access for the same Action', async () => {
    const plan = await createAuthorization().plan(
      { id: 'bob' },
      {
        resource: 'customers',
        action: 'read',
        fields: { output: ['name', 'email'] },
      },
    );
    expect(plan.allowed).toBe(true);
    expect(plan.fields?.output).toEqual([
      'id',
      'name',
      'ownerId',
      'email',
      'createdById',
    ]);
    expect(plan.filter?.root.logic).toBe('or');
  });

  it('uses the selected Action fields and record range', async () => {
    const authorization = createAuthorization();
    await expect(
      authorization.can(
        { id: 'alice' },
        {
          resource: 'orders',
          action: 'update',
          fields: { input: ['amount'], output: ['status'] },
          record: { ownerId: 'alice' },
        },
      ),
    ).resolves.toBe(false);
    await expect(
      authorization.can(
        { id: 'alice' },
        {
          resource: 'orders',
          action: 'approve',
          fields: { input: ['approvalComment'], output: ['status'] },
          record: { ownerId: 'alice' },
        },
      ),
    ).resolves.toBe(true);
  });

  it('builds requested Action plans together for repository batch capability checks', async () => {
    const plans = await createAuthorization().planActions(
      { id: 'alice' },
      {
        resource: 'orders',
        actions: ['read', 'update', 'approve', 'update'],
        fields: {
          update: { input: ['amount', 'customer'] },
          approve: { input: ['approvalComment'] },
        },
      },
    );
    expect(Object.keys(plans)).toEqual(['read', 'update', 'approve']);
    expect(plans.update?.allowed).toBe(true);
    expect(plans.update?.fields?.input).toEqual(['amount', 'customer']);
    expect(plans.approve?.allowed).toBe(true);
    expect(plans.read?.filter).toBeDefined();
  });

  it('does not allow unreadable fields in filters, sorting, or grouping', async () => {
    const authorization = createAuthorization();
    for (const fields of [
      { filter: ['approvalComment'] },
      { sort: ['approvalComment'] },
      { group: ['approvalComment'] },
    ]) {
      await expect(
        authorization.can(
          { id: 'alice' },
          {
            resource: 'orders',
            action: 'read',
            fields,
            record: { ownerId: 'alice' },
          },
        ),
      ).resolves.toBe(false);
    }
  });

  it('requires source, relation, and target permissions for traverse', async () => {
    const authorization = createAuthorization();
    await expect(
      authorization.canRelation(
        { id: 'alice' },
        {
          resource: 'orders',
          field: 'customer',
          action: 'traverse',
          sourceRecord: { ownerId: 'alice' },
          targetRecord: { id: 'customer-1', createdById: 'alice' },
        },
      ),
    ).resolves.toBe(true);
    await expect(
      authorization.canRelation(
        { id: 'alice' },
        {
          resource: 'orders',
          field: 'customer',
          action: 'traverse',
          sourceRecord: { ownerId: 'bob' },
          targetRecord: { id: 'customer-1', createdById: 'alice' },
        },
      ),
    ).resolves.toBe(false);
  });

  it('intersects connect target access with the target Read plan', async () => {
    const authorization = createAuthorization();
    await expect(
      authorization.canRelation(
        { id: 'alice' },
        {
          resource: 'orders',
          field: 'customer',
          action: 'connect',
          sourceRecord: { ownerId: 'alice' },
          targetRecord: { id: 'customer-1', createdById: 'alice' },
        },
      ),
    ).resolves.toBe(true);
    await expect(
      authorization.canRelation(
        { id: 'alice' },
        {
          resource: 'orders',
          field: 'customer',
          action: 'connect',
          sourceRecord: { ownerId: 'alice' },
          targetRecord: { id: 'customer-2', createdById: 'bob' },
        },
      ),
    ).resolves.toBe(false);
  });

  it('uses the same writable relation field permission for connect and disconnect', async () => {
    const authorization = createAuthorization();
    await expect(
      authorization.canRelation(
        { id: 'alice' },
        {
          resource: 'orders',
          field: 'customer',
          action: 'disconnect',
          sourceRecord: { ownerId: 'alice' },
          targetRecord: { id: 'customer-1' },
        },
      ),
    ).resolves.toBe(true);
  });

  it('requires the relation field to be writable for connect and disconnect', async () => {
    const authorization = createAuthorization(false);
    await expect(
      authorization.canRelation(
        { id: 'alice' },
        {
          resource: 'orders',
          field: 'customer',
          action: 'traverse',
          sourceRecord: { ownerId: 'alice' },
          targetRecord: { id: 'customer-1', createdById: 'alice' },
        },
      ),
    ).resolves.toBe(true);
    await expect(
      authorization.canRelation(
        { id: 'alice' },
        {
          resource: 'orders',
          field: 'customer',
          action: 'connect',
          sourceRecord: { ownerId: 'alice' },
          targetRecord: { id: 'customer-1', createdById: 'alice' },
        },
      ),
    ).resolves.toBe(false);
    await expect(
      authorization.canRelation(
        { id: 'alice' },
        {
          resource: 'orders',
          field: 'customer',
          action: 'disconnect',
          sourceRecord: { ownerId: 'alice' },
        },
      ),
    ).resolves.toBe(false);
  });

  it('fails closed when a Policy cannot resolve a resource attribute', async () => {
    const store = new MemoryAuthorizationStore({
      permissionSets: [
        {
          key: 'reader',
          permissions: [
            {
              resource: 'logs',
              actions: [
                {
                  action: 'read',
                  outputFields: '*',
                  recordScope: [{ policy: 'recordsIOwn' }],
                },
              ],
            },
          ],
        },
      ],
      assignments: [
        {
          id: 'a1',
          subject: { type: 'user', id: 'alice' },
          target: { type: 'permissionSet', key: 'reader' },
        },
      ],
    });
    const authorization = new Authorization({ store });
    authorization.resources.register({
      name: 'logs',
      actions: ['read'],
      fields: { id: scalar() },
    });
    const plan = await authorization.plan(
      { id: 'alice' },
      { resource: 'logs', action: 'read' },
    );
    expect(plan.allowed).toBe(false);
    expect(plan.reasons.at(-1)?.key).toBe('AUTHORIZATION_RESOLUTION_FAILED');
  });
});

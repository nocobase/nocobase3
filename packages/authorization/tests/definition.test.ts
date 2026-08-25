import { describe, expect, it } from 'vitest';
import {
  Authorization,
  MemoryAuthorizationStore,
  type AuthorizationDefinition,
} from '../src/index.js';

function createAuthorization() {
  const authz = new Authorization({ store: new MemoryAuthorizationStore() });
  authz.resources.register({
    name: 'customers',
    actions: ['read'],
    fields: { id: { type: 'scalar' } },
  });
  authz.resources.register({
    name: 'orders',
    actions: ['read', 'update'],
    fields: {
      id: { type: 'scalar' },
      ownerId: { type: 'scalar' },
      customer: { type: 'relation', target: 'customers', cardinality: 'one' },
    },
    attributes: { owner: 'ownerId' },
  });
  return authz;
}

function baseDefinition(authz: Authorization): AuthorizationDefinition {
  return authz.define({
    permissionSets: [
      {
        key: 'order-reader',
        permissions: [
          {
            resource: 'orders',
            actions: [
              {
                action: 'read',
                outputFields: ['id', 'ownerId', 'customer'],
                recordScope: [{ policy: 'recordsIOwn' }],
              },
            ],
          },
        ],
      },
    ],
    assignments: [
      {
        id: 'assignment-1',
        subject: { type: 'user', id: 'alice' },
        target: { type: 'permissionSet', key: 'order-reader' },
      },
    ],
  });
}

describe('Authorization definitions', () => {
  it('normalizes Object DSL into a business-only definition', () => {
    const authz = createAuthorization();
    expect(authz.define()).toEqual({
      permissionSets: [],
      permissionSetGroups: [],
      assignments: [],
      organizationWideDefaults: {},
      sharingRules: [],
      restrictionRules: [],
    });
    expect(authz.describe().resources.map((resource) => resource.name)).toEqual(
      ['customers', 'orders'],
    );
    expect(authz.describe().policies.map((policy) => policy.key)).toContain(
      'recordsIOwn',
    );
  });

  it('compiles Fluent DSL into the same canonical definition as Object DSL', () => {
    const authz = createAuthorization();
    const objectDefinition = baseDefinition(authz);
    const fluentDefinition = authz.define((definition) => {
      definition.permissionSet('order-reader', (permissionSet) => {
        permissionSet.resource('orders', (permission) => {
          permission.action('read', {
            outputFields: ['id', 'ownerId', 'customer'],
            recordScope: [{ policy: 'recordsIOwn' }],
          });
        });
      });
      definition.assignment('assignment-1', {
        subject: { type: 'user', id: 'alice' },
        target: { type: 'permissionSet', key: 'order-reader' },
      });
    });
    expect(fluentDefinition).toEqual(objectDefinition);
    expect(authz.validate(fluentDefinition).valid).toBe(true);
  });

  it('returns structured diagnostics using the instance catalog', () => {
    const authz = createAuthorization();
    const definition = baseDefinition(authz);
    definition.permissionSets[0]!.permissions[0]!.actions[0]!.outputFields = [
      'missing',
    ];
    definition.permissionSetGroups = [
      { key: 'sales', permissionSets: ['missing-set'] },
    ];

    const result = authz.validate(definition);
    expect(result.valid).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'UNKNOWN_FIELD',
          path: [
            'permissionSets',
            0,
            'permissions',
            0,
            'actions',
            0,
            'outputFields',
            0,
          ],
        }),
        expect.objectContaining({
          code: 'UNKNOWN_PERMISSION_SET',
          path: ['permissionSetGroups', 0, 'permissionSets', 0],
        }),
      ]),
    );
  });

  it('validates Sharing and Restriction Rule scopes against their intended policy usage', () => {
    const authz = createAuthorization();
    const definition = authz.define((builder) => {
      builder.sharingRule('share-owned-orders', {
        resource: 'orders',
        actions: ['read'],
        subjects: [{ type: 'user', id: 'bob' }],
        records: { type: 'criteria', scopes: [{ policy: 'recordsIOwn' }] },
      });
      builder.restrictionRule('restrict-owned-orders', {
        resource: 'orders',
        actions: ['read'],
        subjects: [{ type: 'user', id: 'bob' }],
        scopes: [{ policy: 'recordsIOwn' }],
      });
    });
    expect(authz.validate(definition)).toEqual({
      valid: true,
      diagnostics: [],
    });

    const invalid = authz.define({
      sharingRules: [
        {
          key: 'invalid-share',
          resource: 'orders',
          actions: [],
          subjects: [],
          records: { type: 'criteria', scopes: [{ policy: 'missing' }] },
        },
      ],
      restrictionRules: [
        {
          key: 'invalid-restriction',
          resource: 'missing',
          actions: ['read'],
          subjects: [],
          scopes: [],
        },
      ],
    });
    const result = authz.validate(invalid);
    expect(result.valid).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'EMPTY_VALUE',
          path: ['sharingRules', 0, 'actions'],
        }),
        expect.objectContaining({
          code: 'EMPTY_VALUE',
          path: ['sharingRules', 0, 'subjects'],
        }),
        expect.objectContaining({
          code: 'UNKNOWN_POLICY',
          path: ['sharingRules', 0, 'records', 'scopes', 0, 'policy'],
        }),
        expect.objectContaining({
          code: 'UNKNOWN_RESOURCE',
          path: ['restrictionRules', 0, 'resource'],
        }),
        expect.objectContaining({
          code: 'EMPTY_VALUE',
          path: ['restrictionRules', 0, 'scopes'],
        }),
      ]),
    );
  });

  it('produces a business-only operation plan without applying it', () => {
    const authz = createAuthorization();
    const current = baseDefinition(authz);
    const desired = authz.define({
      ...current,
      permissionSets: [
        {
          ...current.permissionSets[0]!,
          title: 'Order reader',
        },
      ],
      assignments: [],
      organizationWideDefaults: {
        orders: { access: 'private' },
      },
      sharingRules: [
        {
          key: 'share-orders',
          resource: 'orders',
          actions: ['read'],
          subjects: [{ type: 'user', id: 'bob' }],
          records: { type: 'records', ids: ['order-1'] },
        },
      ],
    });

    expect(authz.diff(current, desired)).toEqual([
      {
        type: 'upsertPermissionSet',
        key: 'order-reader',
        value: desired.permissionSets[0],
      },
      { type: 'removeAssignment', id: 'assignment-1' },
      {
        type: 'setOrganizationWideDefault',
        resource: 'orders',
        value: { access: 'private' },
      },
      {
        type: 'upsertSharingRule',
        key: 'share-orders',
        value: desired.sharingRules[0],
      },
    ]);
  });
});

import { describe, expect, it } from 'vitest';
import {
  createAuthorization,
  permissionSetsPlugin,
  restrictionRulesPlugin,
  selection,
  type AuthorizationPlugin,
  type RestrictionRule,
  type RestrictionRuleStore,
} from '../src/index.js';
import { MockPermissionSetStore } from './mock-permission-set-store.js';

class MockRestrictionRuleStore implements RestrictionRuleStore {
  constructor(private readonly rules: readonly RestrictionRule[]) {}
  create(rule: RestrictionRule): Promise<RestrictionRule> {
    return Promise.resolve(rule);
  }
  update(_key: string, rule: RestrictionRule): Promise<RestrictionRule> {
    return Promise.resolve(rule);
  }
  delete(): Promise<void> {
    return Promise.resolve();
  }
  get(key: string): Promise<RestrictionRule | undefined> {
    return Promise.resolve(this.rules.find((rule) => rule.key === key));
  }
  list(): Promise<readonly RestrictionRule[]> {
    return Promise.resolve(this.rules);
  }
  /** In-memory stores have no transactions. */
  withTransaction(): RestrictionRuleStore {
    return this;
  }
}

const resource = {
  type: 'database.collection',
  id: 'main.orders',
} as const;
const root = { principal: { type: 'user', id: 'root' } };

/** Records whether the handler was ever asked to resolve constraints. */
function recordingResource(): {
  plugin: AuthorizationPlugin;
  constraintCalls: number;
} {
  const state = { constraintCalls: 0 };
  return {
    get constraintCalls(): number {
      return state.constraintCalls;
    },
    plugin: {
      id: 'recording',
      requiresGrants: true,
      setup(authz): void {
        authz.resourceTypes.add({
          type: 'database.collection',
          actions: ['read', 'create', 'update', 'delete'],
          async authorize(request, context) {
            await context.constraints.resolve(request);
            state.constraintCalls += 1;
            return { effect: 'deny', reasons: [] };
          },
          authorizeUnrestricted() {
            return Promise.resolve({
              effect: 'permit',
              reasons: [{ code: 'UNRESTRICTED_ACCESS', message: 'allowed' }],
            });
          },
        });
      },
    },
  };
}

function superuserStore(
  assignments: readonly { id: string; subjectId: string }[] = [
    { id: 'root-superuser', subjectId: 'root' },
  ],
): MockPermissionSetStore {
  return new MockPermissionSetStore({
    permissionSets: [{ key: 'superuser', title: 'Superuser', grants: [] }],
    assignments: assignments.map((assignment) => ({
      id: assignment.id,
      subject: { type: 'user', id: assignment.subjectId },
      permissionSet: 'superuser',
    })),
  });
}

describe('unrestricted access', () => {
  it('permits a resource type whose handler has no authorizeUnrestricted', async () => {
    const authorization = createAuthorization({
      plugins: [permissionSetsPlugin({ store: superuserStore() })],
    });
    authorization.resourceTypes.add({
      type: 'test-resource',
      actions: ['read', 'delete'],
      authorize: async () => ({ effect: 'deny', reasons: [] }),
    });
    const request = {
      resource: { type: 'test-resource', id: 'first' },
      action: 'delete',
    } as const;

    await expect(
      authorization.for(root).authorize(request),
    ).resolves.toMatchObject({
      effect: 'deny',
    });

    authorization.permissionSets.protect({
      owner: '@nocobase/test',
      keys: ['superuser'],
      unrestricted: true,
    });

    await expect(
      authorization.for(root).authorize(request),
    ).resolves.toMatchObject({
      effect: 'permit',
      reasons: [{ code: 'UNRESTRICTED_ACCESS' }],
    });
  });

  it('ignores a Restriction Rule that would otherwise narrow a resource scope', async () => {
    const restrictions = new MockRestrictionRuleStore([
      {
        key: 'owned-only',
        resource,
        actions: [
          {
            action: 'read',
            selection: selection.recordAccess('recordsIOwn'),
          },
        ],
        subjects: [{ type: 'user', id: 'root' }],
      },
    ]);
    const handler = recordingResource();
    const authorization = createAuthorization({
      plugins: [
        permissionSetsPlugin({ store: superuserStore() }),
        restrictionRulesPlugin({ store: restrictions }),
        handler.plugin,
      ],
    });
    authorization.permissionSets.protect({
      owner: '@nocobase/test',
      keys: ['superuser'],
      unrestricted: true,
    });

    await expect(
      authorization.for(root).authorize({ resource, action: 'read' }),
    ).resolves.toMatchObject({
      effect: 'permit',
      reasons: [{ code: 'UNRESTRICTED_ACCESS' }],
    });
    expect(handler.constraintCalls).toBe(0);
  });

  it('still denies a resource type no handler accepts', async () => {
    const authorization = createAuthorization({
      plugins: [
        permissionSetsPlugin({ store: superuserStore() }),
        recordingResource().plugin,
      ],
    });
    authorization.permissionSets.protect({
      owner: '@nocobase/test',
      keys: ['superuser'],
      unrestricted: true,
    });

    await expect(
      authorization.for(root).authorize({
        resource: { type: 'unregistered.resource', id: 'anything' },
        action: 'read',
      }),
    ).resolves.toMatchObject({
      effect: 'deny',
      reasons: [{ code: 'UNKNOWN_RESOURCE_TYPE' }],
    });
  });

  it('reports unrestricted in the snapshot', async () => {
    const authorization = createAuthorization({
      plugins: [permissionSetsPlugin({ store: superuserStore() })],
    });
    await expect(authorization.for(root).snapshot()).resolves.toEqual({
      unrestricted: false,
      permissions: [],
    });

    authorization.permissionSets.protect({
      owner: '@nocobase/test',
      keys: ['superuser'],
      unrestricted: true,
    });

    await expect(authorization.for(root).snapshot()).resolves.toEqual({
      unrestricted: true,
      permissions: [],
    });
  });

  it('rejects a conflicting owner and releases only its own declaration', () => {
    const authorization = createAuthorization({
      plugins: [permissionSetsPlugin({ store: superuserStore() })],
    });
    const release = authorization.permissionSets.protect({
      owner: '@nocobase/first',
      keys: ['superuser'],
      unrestricted: true,
    });

    expect(authorization.permissionSets.protection('superuser')).toMatchObject({
      unrestricted: true,
    });
    expect(() =>
      authorization.permissionSets.protect({
        owner: '@nocobase/second',
        keys: ['superuser'],
        unrestricted: true,
      }),
    ).toThrow('already protected by @nocobase/first');

    const other = authorization.permissionSets.protect({
      owner: '@nocobase/second',
      keys: ['another'],
      unrestricted: true,
    });
    other();
    expect(authorization.permissionSets.protection('another')).toBeUndefined();
    expect(
      authorization.permissionSets.protection('superuser')?.unrestricted,
    ).toBe(true);

    release();
    expect(
      authorization.permissionSets.protection('superuser'),
    ).toBeUndefined();
  });
});

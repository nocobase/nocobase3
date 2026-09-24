import { describe, expect, it } from 'vitest';
import {
  createAuthorization,
  permissionSetsPlugin,
  restrictionRulesPlugin,
  selection,
  type AuthorizationPlugin,
  type RestrictionRule,
} from '../src/index.js';
import { MemoryRuleStore } from './helpers/memory-rule-store.js';
import { MockPermissionSetStore } from './helpers/mock-permission-set-store.js';

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
  it('permits a resource type whose handler has no authorizeUnrestricted and still denies an unregistered one', async () => {
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

  it('ignores a Restriction Rule that would otherwise narrow a resource scope', async () => {
    const restrictions = new MemoryRuleStore<RestrictionRule>([
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

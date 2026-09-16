import { createAuthorization } from './authorization-fixture.js';
import { createPermissionSetHandler } from '../server/management/permission-sets.js';
import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import {
  permissionSets,
  PermissionSetLastAssignmentError,
  PermissionSetProtectedError,
  PermissionSetSubjectNotAllowedError,
  PERMISSION_SETS_PROTECTION_OWNER,
  type PermissionSetAssignment,
} from '@nocobase/authorization';
import {
  MockPermissionSetStore,
  type MockPermissionSetStoreOptions,
} from './mock-permission-set-store.js';

/** The mock store ignores it; only its presence changes what the service does. */
const transaction = {};

/** Records the order of the reads the invariant depends on. */
class RecordingPermissionSetStore extends MockPermissionSetStore {
  readonly calls: string[] = [];

  async lock(key: string): Promise<void> {
    this.calls.push(`lock:${key}`);
  }

  override async listAssignments(
    permissionSet?: string,
  ): Promise<readonly PermissionSetAssignment[]> {
    this.calls.push(`listAssignments:${permissionSet ?? '*'}`);
    return super.listAssignments(permissionSet);
  }
}

function administratorOptions(
  subjectIds: readonly string[],
): MockPermissionSetStoreOptions {
  return {
    permissionSets: [
      { key: 'administrator', title: 'Administrator', grants: [] },
      { key: 'viewer', title: 'Viewer', grants: [] },
    ],
    assignments: subjectIds.map((subjectId) => ({
      id: `${subjectId}-administrator`,
      subject: { type: 'user', id: subjectId },
      permissionSet: 'administrator',
    })),
  };
}

function createProtectedAuthorization(options: {
  store: MockPermissionSetStore;
  requireActiveAssignment?: boolean;
  unrestricted?: boolean;
  /** Ids of the `user` subjects that can no longer act. */
  disabledUsers?: readonly string[];
}) {
  const authorization = createAuthorization({
    plugins: [permissionSets({ store: options.store })],
  });
  if (options.disabledUsers) {
    const disabled = new Set(options.disabledUsers);
    authorization.subjects.define('user', {
      filterActive: (ids) =>
        Promise.resolve(ids.filter((id) => !disabled.has(id))),
    });
  }
  authorization.permissionSets.protect({
    owner: '@nocobase/test',
    keys: ['administrator'],
    allow: ['assign', 'revoke'],
    ...(options.requireActiveAssignment === false
      ? {}
      : { requireActiveAssignment: true }),
    ...(options.unrestricted ? { unrestricted: true } : {}),
  });
  return authorization;
}

describe('Permission Sets that require an active assignment', () => {
  it('refuses the revocation that would remove the last assignment', async () => {
    const store = new MockPermissionSetStore(
      administratorOptions(['root', 'second']),
    );
    const authorization = createProtectedAuthorization({ store });

    await authorization.permissionSets.revoke('second-administrator');
    await expect(
      authorization.permissionSets.revoke('root-administrator'),
    ).rejects.toBeInstanceOf(PermissionSetLastAssignmentError);
    await expect(
      authorization.permissionSets.listAssignments('administrator'),
    ).resolves.toHaveLength(1);
  });

  it('counts the people who can still act rather than the assignment rows', async () => {
    const store = new MockPermissionSetStore(
      administratorOptions(['root', 'disabled']),
    );
    const authorization = createProtectedAuthorization({
      store,
      disabledUsers: ['disabled'],
    });

    // Two rows remain, but only one of them belongs to an account that can
    // still sign in, so the enabled one is already the last.
    await expect(
      authorization.permissionSets.revoke('root-administrator'),
    ).rejects.toBeInstanceOf(PermissionSetLastAssignmentError);
    await expect(
      authorization.permissionSets.revoke('disabled-administrator'),
    ).resolves.toBeUndefined();
  });

  it('counts every assignment when no subject type declares otherwise', async () => {
    const store = new MockPermissionSetStore(
      administratorOptions(['root', 'disabled']),
    );
    const authorization = createProtectedAuthorization({ store });

    await expect(
      authorization.permissionSets.revoke('root-administrator'),
    ).resolves.toBeUndefined();
  });

  it('enforces nothing for a set that does not declare the flag', async () => {
    const store = new MockPermissionSetStore(administratorOptions(['root']));
    // Unrestricted access alone must not imply the rule.
    const authorization = createProtectedAuthorization({
      store,
      requireActiveAssignment: false,
      unrestricted: true,
    });

    await expect(
      authorization.permissionSets.revoke('root-administrator'),
    ).resolves.toBeUndefined();
    await expect(
      authorization.permissionSets.listAssignments('administrator'),
    ).resolves.toHaveLength(0);
  });

  it('refuses to replace away the last assignment', async () => {
    const store = new MockPermissionSetStore(
      administratorOptions(['root', 'second']),
    );
    const authorization = createProtectedAuthorization({ store });
    const replace = (
      subjectId: string,
    ): Promise<readonly PermissionSetAssignment[]> =>
      authorization.permissionSets.replaceSubjectAssignments({
        subject: { type: 'user', id: subjectId },
        managedPermissionSets: ['administrator', 'viewer'],
        permissionSets: ['viewer'],
      });

    await expect(replace('second')).resolves.toMatchObject([
      { permissionSet: 'viewer' },
    ]);
    await expect(replace('root')).rejects.toBeInstanceOf(
      PermissionSetLastAssignmentError,
      PermissionSetProtectedError,
    );
    await expect(
      authorization.permissionSets.listAssignments('administrator'),
    ).resolves.toHaveLength(1);
  });

  it('answers assertSubjectRemovable for the subjects that hold the set', async () => {
    const store = new MockPermissionSetStore(
      administratorOptions(['root', 'second']),
    );
    await store.assignPermissionSet({
      id: 'viewer-viewer',
      subject: { type: 'user', id: 'viewer' },
      permissionSet: 'viewer',
    });
    const authorization = createProtectedAuthorization({ store });
    const removable = (subjectId: string): Promise<void> =>
      authorization.permissionSets.assertSubjectRemovable({
        type: 'user',
        id: subjectId,
      });

    await expect(removable('viewer')).resolves.toBeUndefined();
    await expect(removable('root')).resolves.toBeUndefined();

    await authorization.permissionSets.revoke('second-administrator');
    await expect(removable('root')).rejects.toBeInstanceOf(
      PermissionSetLastAssignmentError,
      PermissionSetProtectedError,
    );
  });

  it('takes the store lock before reading the assignments it counts', async () => {
    const store = new RecordingPermissionSetStore(
      administratorOptions(['root']),
    );
    const authorization = createProtectedAuthorization({ store });

    await expect(
      authorization.permissionSets.revoke('root-administrator'),
    ).rejects.toBeInstanceOf(PermissionSetLastAssignmentError);
    const lockIndex = store.calls.indexOf('lock:administrator');
    expect(lockIndex).toBeGreaterThanOrEqual(0);
    expect(
      store.calls.indexOf('listAssignments:administrator'),
    ).toBeGreaterThan(lockIndex);
  });

  it('answers 409 LAST_ASSIGNMENT from the Permission Set handler', async () => {
    const store = new MockPermissionSetStore(administratorOptions(['root']));
    const authorization = createProtectedAuthorization({
      store,
      unrestricted: true,
    });
    const router = new Hono();
    router.on(
      ['GET', 'POST', 'PUT', 'DELETE'],
      ['/authz/permission-sets', '/authz/permission-sets/*'],
      (context) =>
        createPermissionSetHandler(authorization.permissionSets)({
          request: context.req.raw,
          authorization: authorization.for({
            principal: { type: 'user', id: 'root' },
          }),
          path: context.req.path.slice('/authz'.length),
        }),
    );

    const response = await router.request(
      '/authz/permission-sets/assignments/root-administrator',
      { method: 'DELETE' },
    );
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: 'LAST_ASSIGNMENT',
    });
  });
});

describe('the Permission Set the library protects as the root set', () => {
  it('protects it exactly as an explicit protect call did', () => {
    const authorization = createAuthorization({
      plugins: [
        permissionSets({
          store: new MockPermissionSetStore(administratorOptions(['root'])),
          rootSet: 'administrator',
        }),
      ],
    });

    expect(authorization.permissionSets.protection('administrator')).toEqual({
      owner: PERMISSION_SETS_PROTECTION_OWNER,
      allow: ['assign', 'revoke'],
      requireActiveAssignment: true,
      unrestricted: true,
    });
    expect(authorization.permissionSets.isUnrestricted('administrator')).toBe(
      true,
    );
  });

  it('lets the application keep the set empty', async () => {
    const authorization = createAuthorization({
      plugins: [
        permissionSets({
          store: new MockPermissionSetStore(administratorOptions(['root'])),
          rootSet: { key: 'administrator', requireActiveAssignment: false },
        }),
      ],
    });

    expect(authorization.permissionSets.protection('administrator')).toEqual({
      owner: PERMISSION_SETS_PROTECTION_OWNER,
      allow: ['assign', 'revoke'],
      unrestricted: true,
    });
    await expect(
      authorization.permissionSets.revoke('root-administrator'),
    ).resolves.toBeUndefined();
  });

  it('protects nothing when the application declares no root set', () => {
    const authorization = createAuthorization({
      plugins: [
        permissionSets({
          store: new MockPermissionSetStore(administratorOptions(['root'])),
        }),
      ],
    });

    expect(
      authorization.permissionSets.protection('administrator'),
    ).toBeUndefined();
  });
});

describe('the Permission Set the library protects as the default set', () => {
  it('keeps its grants editable while the set and its binding are not', () => {
    const authorization = createAuthorization({
      plugins: [
        permissionSets({
          store: new MockPermissionSetStore(administratorOptions(['root'])),
          defaultSet: 'member',
        }),
      ],
    });

    expect(authorization.permissionSets.protection('member')).toEqual({
      owner: PERMISSION_SETS_PROTECTION_OWNER,
      allow: ['update'],
    });
    expect(authorization.permissionSets.isUnrestricted('member')).toBe(false);
    expect(() =>
      authorization.permissionSets.assertWritable('member', 'update'),
    ).not.toThrow();
    for (const operation of ['delete', 'assign', 'revoke'] as const) {
      expect(() =>
        authorization.permissionSets.assertWritable('member', operation),
      ).toThrow(PermissionSetProtectedError);
    }
  });

  it('protects nothing when the application declares no default set', () => {
    const authorization = createAuthorization({
      plugins: [
        permissionSets({
          store: new MockPermissionSetStore(administratorOptions(['root'])),
        }),
      ],
    });

    expect(authorization.permissionSets.protection('member')).toBeUndefined();
  });
});

describe('the subject types a Permission Set may be assigned to', () => {
  function authorizationWithAssignableTo(
    assignableTo?: readonly string[],
  ): ReturnType<typeof createAuthorization> {
    const authorization = createAuthorization({
      plugins: [
        permissionSets({
          store: new MockPermissionSetStore(administratorOptions([])),
        }),
      ],
    });
    authorization.permissionSets.protect({
      owner: '@nocobase/test',
      keys: ['administrator'],
      allow: ['assign', 'revoke'],
      ...(assignableTo ? { assignableTo } : {}),
    });
    return authorization;
  }

  it('refuses a subject type the set does not declare', async () => {
    const authorization = authorizationWithAssignableTo(['user']);

    await expect(
      authorization.permissionSets.assign({
        subject: { type: 'authenticated', id: '*' },
        permissionSet: 'administrator',
      }),
    ).rejects.toBeInstanceOf(PermissionSetSubjectNotAllowedError);
    await expect(
      authorization.permissionSets.listAssignments('administrator'),
    ).resolves.toEqual([]);

    await expect(
      authorization.permissionSets.assign({
        subject: { type: 'user', id: 'alice' },
        permissionSet: 'administrator',
      }),
    ).resolves.toMatchObject({ permissionSet: 'administrator' });
  });

  it('refuses the same subject type when assignments are replaced', async () => {
    const authorization = authorizationWithAssignableTo(['user']);

    await expect(
      authorization.permissionSets.replaceSubjectAssignments({
        subject: { type: 'authenticated', id: '*' },
        managedPermissionSets: ['administrator', 'viewer'],
        permissionSets: ['administrator'],
      }),
    ).rejects.toBeInstanceOf(PermissionSetSubjectNotAllowedError);
    await expect(
      authorization.permissionSets.listAssignments('administrator'),
    ).resolves.toEqual([]);

    await expect(
      authorization.permissionSets.replaceSubjectAssignments({
        subject: { type: 'user', id: 'alice' },
        managedPermissionSets: ['administrator', 'viewer'],
        permissionSets: ['administrator'],
      }),
    ).resolves.toMatchObject([{ permissionSet: 'administrator' }]);
  });

  it('accepts any subject type when the set declares none', async () => {
    const authorization = authorizationWithAssignableTo();

    await expect(
      authorization.permissionSets.assign({
        subject: { type: 'authenticated', id: '*' },
        permissionSet: 'administrator',
      }),
    ).resolves.toMatchObject({ subject: { type: 'authenticated' } });
  });

  it('answers 403 PERMISSION_SET_SUBJECT_NOT_ALLOWED from the handler', async () => {
    const authorization = authorizationWithAssignableTo(['user']);
    authorization.permissionSets.protect({
      owner: '@nocobase/test',
      keys: ['administrator'],
      allow: ['assign', 'revoke'],
      assignableTo: ['user'],
      unrestricted: true,
    });
    await authorization.permissionSets.assign({
      subject: { type: 'user', id: 'root' },
      permissionSet: 'administrator',
    });
    const router = new Hono();
    router.on(
      ['GET', 'POST', 'PUT', 'DELETE'],
      ['/authz/permission-sets', '/authz/permission-sets/*'],
      (context) =>
        createPermissionSetHandler(authorization.permissionSets)({
          request: context.req.raw,
          authorization: authorization.for({
            principal: { type: 'user', id: 'root' },
          }),
          path: context.req.path.slice('/authz'.length),
        }),
    );

    const response = await router.request(
      '/authz/permission-sets/administrator/assignments',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ subject: { type: 'authenticated', id: '*' } }),
      },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      code: 'PERMISSION_SET_SUBJECT_NOT_ALLOWED',
    });
  });

  it('carries the root set restriction only when the application declares it', () => {
    const restricted = createAuthorization({
      plugins: [
        permissionSets({
          store: new MockPermissionSetStore(administratorOptions(['root'])),
          rootSet: { key: 'administrator', assignableTo: ['user'] },
        }),
      ],
    });
    const unrestricted = createAuthorization({
      plugins: [
        permissionSets({
          store: new MockPermissionSetStore(administratorOptions(['root'])),
          rootSet: 'administrator',
        }),
      ],
    });

    expect(restricted.permissionSets.protection('administrator')).toMatchObject(
      { assignableTo: ['user'] },
    );
    expect(
      unrestricted.permissionSets.protection('administrator'),
    ).not.toHaveProperty('assignableTo');
  });
});

describe('subscribing to assignment changes', () => {
  function authorizationWithAssignments(): ReturnType<
    typeof createAuthorization
  > {
    return createAuthorization({
      plugins: [
        permissionSets({
          store: new MockPermissionSetStore(administratorOptions(['root'])),
        }),
      ],
    });
  }

  it('notifies every subscriber when an assignment changes', async () => {
    const authorization = authorizationWithAssignments();
    const changed = vi.fn();
    authorization.onGrantsChanged(changed);

    await authorization.permissionSets.assign({
      subject: { type: 'user', id: 'second' },
      permissionSet: 'administrator',
    });

    expect(changed.mock.calls).toEqual([[{ type: 'user', id: 'second' }]]);
  });

  it('notifies nobody from a service bound to a transaction', async () => {
    const authorization = authorizationWithAssignments();
    const changed = vi.fn();
    authorization.onGrantsChanged(changed);

    await authorization.permissionSets.withTransaction(transaction).assign({
      subject: { type: 'user', id: 'second' },
      permissionSet: 'administrator',
    });

    expect(changed).not.toHaveBeenCalled();
  });

  it('stops notifying once the subscription is released', async () => {
    const authorization = authorizationWithAssignments();
    const changed = vi.fn();
    const release = authorization.onGrantsChanged(changed);

    release();
    await authorization.permissionSets.assign({
      subject: { type: 'user', id: 'second' },
      permissionSet: 'administrator',
    });

    expect(changed).not.toHaveBeenCalled();
  });
});

import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import {
  createAuthorization,
  permissionSets,
  PermissionSetLastAssignmentError,
  type PermissionSetAssignment,
  type PermissionSetSubject,
} from '../src/index.js';
import {
  MockPermissionSetStore,
  type MockPermissionSetStoreOptions,
} from './mock-permission-set-store.js';

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
  filterActiveSubjects?: (
    subjects: readonly PermissionSetSubject[],
  ) => Promise<readonly PermissionSetSubject[]>;
}) {
  const authorization = createAuthorization({
    plugins: [
      permissionSets({
        store: options.store,
        ...(options.filterActiveSubjects === undefined
          ? {}
          : { filterActiveSubjects: options.filterActiveSubjects }),
      }),
    ],
  });
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

/** Keeps every subject except the ones named, standing in for disabled accounts. */
function withoutSubjects(
  ...ids: readonly string[]
): (
  subjects: readonly PermissionSetSubject[],
) => Promise<readonly PermissionSetSubject[]> {
  const excluded = new Set(ids);
  return (subjects) =>
    Promise.resolve(subjects.filter((subject) => !excluded.has(subject.id)));
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
      filterActiveSubjects: withoutSubjects('disabled'),
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

  it('counts every assignment when the application supplies no filter', async () => {
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
        authorization.permissionSets.handler({
          request: context.req.raw,
          authorization: authorization.for({
            principal: { type: 'user', id: 'root' },
          }),
          basePath: '/authz',
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

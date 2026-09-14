import type { AuthorizationUser } from '../authorization-client.js';

/**
 * Who the settings pages can name and offer to pick. Users are read from the
 * Users API, which authorizes against the `user` resource, while these pages
 * authorize against `authorization.settings/*`: someone who administers
 * permission sets may not be allowed to read users at all.
 */
export interface UserDirectory {
  readonly users: readonly AuthorizationUser[];
  /**
   * Why no user can be named here. Assignments still list their subject ids,
   * but nothing new can be assigned to a user nobody can look up.
   */
  readonly unavailable?: string;
}

export function userDirectory(
  users: readonly AuthorizationUser[],
): UserDirectory {
  return { users };
}

export function unavailableUserDirectory(error: unknown): UserDirectory {
  return {
    users: [],
    unavailable:
      status(error) === 403
        ? 'You do not have permission to read users. Assignments are shown by user id, and adding one is unavailable.'
        : 'Users could not be loaded. Assignments are shown by user id, and adding one is unavailable.',
  };
}

export function canAddAssignment(directory: UserDirectory): boolean {
  return directory.unavailable === undefined;
}

/** The user's name, or the subject id when the directory cannot name them. */
export function userLabel(directory: UserDirectory, id: string): string {
  const user = directory.users.find((item) => item.id === id);
  return user ? `${user.name} · ${user.username ?? user.email}` : `User ${id}`;
}

function status(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const value: unknown = Reflect.get(error, 'status');
  return typeof value === 'number' ? value : undefined;
}

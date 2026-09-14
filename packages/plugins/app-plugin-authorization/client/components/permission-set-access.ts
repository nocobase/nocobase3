import type {
  PermissionSet,
  PermissionSetWriteOperation,
} from '../authorization-client.js';
import { errorMessage } from './feedback.js';

/**
 * What the management UI may offer for one Permission Set. Every answer comes
 * from the metadata the read endpoints report, so no key is hardcoded here.
 */
export interface PermissionSetCapabilities {
  /** Holding the set grants unrestricted access, so it has no grants to configure. */
  readonly unrestricted: boolean;
  /** The set is owned by code; `protection.allow` decides what is still offered. */
  readonly protectedSet: boolean;
  /** The editor may be opened, which is also what renames a set. */
  readonly canUpdate: boolean;
  readonly canDelete: boolean;
  readonly canAssign: boolean;
  readonly canRevoke: boolean;
  /** Subject types a new assignment may target; absent means any. */
  readonly assignableTo?: readonly string[];
}

/** An unsaved set has no server metadata yet and behaves as an ordinary one. */
export function permissionSetCapabilities(
  set?: PermissionSet,
): PermissionSetCapabilities {
  const unrestricted = set?.unrestricted === true;
  return {
    unrestricted,
    protectedSet: set?.protection !== undefined,
    // An unrestricted set has no grants to configure, so the editor is never useful.
    canUpdate: !unrestricted && allows(set, 'update'),
    canDelete: allows(set, 'delete'),
    canAssign: allows(set, 'assign'),
    canRevoke: allows(set, 'revoke'),
    ...(set?.protection?.assignableTo
      ? { assignableTo: set.protection.assignableTo }
      : {}),
  };
}

/** An existing assignment of a type no longer offered still displays; this is about what can be added. */
export function canAssignSubjectType(
  capabilities: PermissionSetCapabilities,
  subjectType: string,
): boolean {
  return (
    capabilities.canAssign &&
    (capabilities.assignableTo === undefined ||
      capabilities.assignableTo.includes(subjectType))
  );
}

function allows(
  set: PermissionSet | undefined,
  operation: PermissionSetWriteOperation,
): boolean {
  const protection = set?.protection;
  return protection === undefined || protection.allow.includes(operation);
}

/**
 * Turns an Authorization API failure into something a user can act on. The
 * server answers the protected and last-assignment cases with a code the panel
 * knows the reason for, so the raw message never has to be read as one.
 */
export function permissionSetErrorMessage(error: unknown): string {
  switch (errorCode(error)) {
    case 'LAST_ASSIGNMENT':
      return 'This is the last assignment of a set the application must always keep someone able to use. Assign it to an enabled account before removing this one, or the application is left without an administrator.';
    case 'PROTECTED_PERMISSION_SET':
      return 'This permission set is maintained by the application and cannot be changed here.';
    case 'PERMISSION_SET_SUBJECT_NOT_ALLOWED':
      return 'This permission set can only be assigned to the subject types the application allows. Assign it to an individual user instead of an audience.';
    default:
      return errorMessage(error);
  }
}

function errorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const code: unknown = Reflect.get(error, 'code');
  return typeof code === 'string' ? code : undefined;
}

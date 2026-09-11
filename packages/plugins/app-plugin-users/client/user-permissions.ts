import type { AuthorizationClient } from '@nocobase/app-plugin-authorization/client';

export const USER_MANAGEMENT_ACTIONS = [
  'create',
  'update',
  'disable',
  'enable',
  'assign-role',
  'reset-password',
  'revoke-sessions',
] as const;

export type UserManagementAction = (typeof USER_MANAGEMENT_ACTIONS)[number];
export type UserCapabilities = Readonly<Record<UserManagementAction, boolean>>;

export function emptyUserCapabilities(): UserCapabilities {
  return Object.fromEntries(
    USER_MANAGEMENT_ACTIONS.map((action) => [action, false]),
  ) as unknown as UserCapabilities;
}

export async function loadUserCapabilities(
  authorization: Pick<AuthorizationClient, 'can'>,
  userId: string,
): Promise<UserCapabilities> {
  const allowed = await Promise.all(
    USER_MANAGEMENT_ACTIONS.map((action) =>
      authorization.can({ type: 'user', id: userId }, action),
    ),
  );
  return Object.fromEntries(
    USER_MANAGEMENT_ACTIONS.map((action, index) => [
      action,
      allowed[index] ?? false,
    ]),
  ) as unknown as UserCapabilities;
}

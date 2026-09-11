import { defineSeed, type SeedDefinition } from '@nocobase/db';

const SYSTEM_ADMINISTRATOR = 'system-administrator';
const USER_ACTIONS = [
  'read',
  'create',
  'update',
  'disable',
  'enable',
  'assign-role',
  'reset-password',
  'revoke-sessions',
] as const;

const seed: SeedDefinition = defineSeed({
  name: '202609080001_grant_system_administrator_user_management',

  async run({ query, connection }) {
    const client = await connection.client<TableSchemaClient>();
    if (!(await client.schema.hasTable('authorization_permission_sets'))) {
      return;
    }
    const permissionSet = await query
      .selectFrom('authorizationPermissionSets')
      .select(['key', 'grants'])
      .where('key', '=', SYSTEM_ADMINISTRATOR)
      .executeTakeFirst();
    if (!permissionSet) return;

    const grants = parseGrants(permissionSet.grants);
    const nextGrants = addUserManagementGrant(grants);
    if (nextGrants === grants) return;

    await query
      .updateTable('authorizationPermissionSets')
      .set({
        grants: JSON.stringify(nextGrants),
        updatedAt: new Date(),
      })
      .where('key', '=', SYSTEM_ADMINISTRATOR)
      .execute();
  },
});

function addUserManagementGrant(
  grants: readonly PermissionGrantRecord[],
): readonly PermissionGrantRecord[] {
  const index = grants.findIndex(
    (grant) => grant.resource.type === 'user' && grant.resource.id === '*',
  );
  if (index === -1) {
    return [
      ...grants,
      {
        resource: { type: 'user', id: '*' },
        actions: USER_ACTIONS.map((action) => ({ action })),
      },
    ];
  }

  const grant = grants[index];
  const existingActions = new Set(grant.actions.map(({ action }) => action));
  const missingActions = USER_ACTIONS.filter(
    (action) => !existingActions.has(action),
  );
  if (missingActions.length === 0) return grants;

  return grants.map((current, currentIndex) =>
    currentIndex === index
      ? {
          ...current,
          actions: [
            ...current.actions,
            ...missingActions.map((action) => ({ action })),
          ],
        }
      : current,
  );
}

function parseGrants(value: unknown): readonly PermissionGrantRecord[] {
  const parsed: unknown = typeof value === 'string' ? JSON.parse(value) : value;
  if (!Array.isArray(parsed) || !parsed.every(isPermissionGrantRecord)) {
    throw new Error(
      'System administrator grants must be a valid permission grant array.',
    );
  }
  return parsed;
}

function isPermissionGrantRecord(
  value: unknown,
): value is PermissionGrantRecord {
  if (!isRecord(value) || !isRecord(value.resource)) return false;
  if (
    typeof value.resource.type !== 'string' ||
    typeof value.resource.id !== 'string' ||
    !Array.isArray(value.actions)
  ) {
    return false;
  }
  return value.actions.every(
    (action) => isRecord(action) && typeof action.action === 'string',
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

interface PermissionGrantRecord {
  readonly resource: {
    readonly type: string;
    readonly id: string;
  };
  readonly actions: readonly {
    readonly action: string;
    readonly policy?: unknown;
  }[];
}

interface TableSchemaClient {
  readonly schema: {
    hasTable(table: string): Promise<boolean>;
  };
}

export default seed;

import { defineSeed, type SeedDefinition } from '@nocobase/db';

const SYSTEM_ADMINISTRATOR = 'system-administrator';
const NOTIFICATION_RESOURCE_TYPE = 'notification';
const NOTIFICATION_TEST_RESOURCE = 'test';
const NOTIFICATION_TEST_ACTION = 'send';

const seed: SeedDefinition = defineSeed({
  name: '202609010001_notification_grant_system_administrator',

  async run({ query }) {
    const permissionSet = await query
      .selectFrom('authorizationPermissionSets')
      .select(['key', 'grants'])
      .where('key', '=', SYSTEM_ADMINISTRATOR)
      .executeTakeFirst();
    if (!permissionSet) return;

    const grants = parseGrants(permissionSet.grants);
    const nextGrants = addNotificationTestGrant(grants);
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

function addNotificationTestGrant(
  grants: readonly PermissionGrantRecord[],
): readonly PermissionGrantRecord[] {
  const index = grants.findIndex(
    (grant) =>
      grant.resource.type === NOTIFICATION_RESOURCE_TYPE &&
      grant.resource.id === NOTIFICATION_TEST_RESOURCE,
  );
  if (index === -1) {
    return [
      ...grants,
      {
        resource: {
          type: NOTIFICATION_RESOURCE_TYPE,
          id: NOTIFICATION_TEST_RESOURCE,
        },
        actions: [{ action: NOTIFICATION_TEST_ACTION }],
      },
    ];
  }

  const grant = grants[index];
  if (grant.actions.some(({ action }) => action === NOTIFICATION_TEST_ACTION)) {
    return grants;
  }
  return grants.map((current, currentIndex) =>
    currentIndex === index
      ? {
          ...current,
          actions: [...current.actions, { action: NOTIFICATION_TEST_ACTION }],
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

export default seed;

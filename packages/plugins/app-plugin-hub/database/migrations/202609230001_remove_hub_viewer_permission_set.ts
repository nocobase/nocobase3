import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const HUB_VIEWER = 'hub-viewer';

// Spelled out rather than imported so that the migration keeps describing the
// permission set as it existed when 202609080001 created it, whatever the
// plugin's current role definitions look like.
const HUB_VIEWER_TITLE = {
  key: 'roles.names.hub-viewer',
  ns: '@nocobase/app-plugin-hub',
};

const HUB_VIEWER_GRANTS = [
  {
    resource: { type: 'page', id: 'hub' },
    actions: [{ action: 'access' }],
  },
  {
    resource: { type: 'hub.app', id: '*' },
    actions: [
      { action: 'read' },
      { action: 'read-release' },
      { action: 'read-deployment' },
    ],
  },
  {
    resource: { type: 'hub.host', id: 'global' },
    actions: [{ action: 'read' }],
  },
];

const migration: MigrationDefinition = defineMigration({
  name: '202609230001_remove_hub_viewer_permission_set',

  async up({ query }) {
    await query
      .deleteFrom('authorizationPermissionSetAssignments')
      .where('permissionSetKey', '=', HUB_VIEWER)
      .execute();
    await query
      .deleteFrom('authorizationPermissionSets')
      .where('key', '=', HUB_VIEWER)
      .execute();
  },

  // Restores the permission set itself. The assignments it carried are not
  // recoverable, so a rollback leaves the set unassigned.
  async down({ query }) {
    const existing = await query
      .selectFrom('authorizationPermissionSets')
      .select('key')
      .where('key', '=', HUB_VIEWER)
      .executeTakeFirst();
    if (existing) return;
    const now = new Date();
    await query
      .insertInto('authorizationPermissionSets')
      .values({
        id: crypto.randomUUID(),
        key: HUB_VIEWER,
        title: JSON.stringify(HUB_VIEWER_TITLE),
        grants: JSON.stringify(HUB_VIEWER_GRANTS),
        createdAt: now,
        updatedAt: now,
      })
      .execute();
  },
});

export default migration;

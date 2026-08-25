import {
  defineMigration,
  type CollectionBuilder,
  type MigrationContext,
  type MigrationDefinition,
} from '@nocobase/app-database';
import type { Knex } from 'knex';

const migration: MigrationDefinition = defineMigration({
  name: '202608250001_expand_application_management_schema',

  async up(context) {
    await alterExistingCollections(context.builder);
    await createDefaultApplicationIndex(context);
    await createRepositoryCollection(context.builder);
    await createReleaseUploadCollection(context.builder);
    await createRuntimeSecretCollection(context.builder);
    await createHealthObservationCollection(context.builder);
    await createAgentDeviceAuthorizationCollection(context.builder);
    await createAgentCredentialCollection(context.builder);
    await createInvitationCollection(context.builder);
    await createIdempotencyRecordCollection(context.builder);
    await createReleaseRetentionCollection(context.builder);
    await createMemberStatusCollection(context.builder);
    await createAssignmentRevisionCollection(context.builder);
    await backfillMemberStatuses(context);
    await backfillAssignmentRevisions(context);
  },

  async down(context) {
    await context.builder.dropCollection('hubAssignmentRevisions');
    await context.builder.dropCollection('hubMemberStatuses');
    await context.builder.dropCollection('hubReleaseRetentions');
    await context.builder.dropCollection('hubIdempotencyRecords');
    await context.builder.dropCollection('hubInvitations');
    await context.builder.dropCollection('hubAgentCredentials');
    await context.builder.dropCollection('hubAgentDeviceAuthorizations');
    await context.builder.dropCollection('hubHealthObservations');
    await context.builder.dropCollection('hubRuntimeSecrets');
    await context.builder.dropCollection('hubReleaseUploads');
    await context.builder.dropCollection('hubRepositories');
    await context.builder.alterCollection('hubAuditLogs', (collection) => {
      collection.dropIndex('idx_hub_audit_logs_app_created');
      collection.dropIndex('idx_hub_audit_logs_result_source');
      collection.dropFields(
        'applicationId',
        'result',
        'source',
        'client',
        'failureCode',
      );
    });
    await context.builder.alterCollection('hubSettings', (collection) => {
      collection.dropField('revision');
    });
    const client = await context.connection.client<Knex>();
    await client.raw('DROP INDEX IF EXISTS uq_hub_applications_default');
    await context.builder.alterCollection('hubApplications', (collection) => {
      collection.dropFields('isDefault', 'revision');
    });
  },
});

export default migration;

async function alterExistingCollections(
  builder: CollectionBuilder,
): Promise<void> {
  await builder.alterCollection('hubApplications', (collection) => {
    collection.boolean('isDefault').notNull().defaultTo(false);
    collection.integer('revision').notNull().defaultTo(1);
  });
  await builder.alterCollection('hubSettings', (collection) => {
    collection.integer('revision').notNull().defaultTo(1);
  });
  await builder.alterCollection('hubAuditLogs', (collection) => {
    collection.string('applicationId', { length: 64 }).nullable();
    collection.string('result', { length: 32 }).notNull().defaultTo('success');
    collection.string('source', { length: 32 }).notNull().defaultTo('system');
    collection.json('client').nullable();
    collection.string('failureCode', { length: 128 }).nullable();
    collection.index(['applicationId', 'createdAt'], {
      name: 'idx_hub_audit_logs_app_created',
    });
    collection.index(['result', 'source'], {
      name: 'idx_hub_audit_logs_result_source',
    });
  });
}

async function createDefaultApplicationIndex(
  context: MigrationContext,
): Promise<void> {
  const client = await context.connection.client<Knex>();
  await client.raw(
    'CREATE UNIQUE INDEX uq_hub_applications_default ON hub_applications (is_default) WHERE is_default = 1',
  );
}

async function createRepositoryCollection(
  builder: CollectionBuilder,
): Promise<void> {
  await builder.createCollection('hubRepositories', (collection) => {
    collection.string('id', { length: 64 }).notNull();
    collection.string('applicationId', { length: 64 }).notNull();
    collection.string('provider', { length: 32 }).notNull();
    collection.string('defaultBranch', { length: 255 }).notNull();
    collection.string('headCommit', { length: 255 }).nullable();
    collection.string('status', { length: 32 }).notNull();
    collection.string('initialCommit', { length: 255 }).nullable();
    collection.datetime('createdAt').notNull();
    collection.datetime('updatedAt').notNull();
    collection.primary('id', { name: 'pk_hub_repositories' });
    collection.unique('applicationId', {
      name: 'uq_hub_repositories_application',
    });
    collection.index('status', { name: 'idx_hub_repositories_status' });
  });
}

async function createReleaseUploadCollection(
  builder: CollectionBuilder,
): Promise<void> {
  await builder.createCollection('hubReleaseUploads', (collection) => {
    collection.string('id', { length: 64 }).notNull();
    collection.string('applicationId', { length: 64 }).notNull();
    collection.string('version', { length: 64 }).notNull();
    collection.string('checksum', { length: 128 }).notNull();
    collection.bigInt('sizeBytes').notNull();
    collection.string('archiveChecksum', { length: 128 }).notNull();
    collection.bigInt('archiveSizeBytes').notNull();
    collection.string('archiveFormat', { length: 32 }).notNull();
    collection.string('sourceCommit', { length: 255 }).notNull();
    collection.json('manifest').notNull();
    collection.string('status', { length: 32 }).notNull();
    collection.string('storageKey', { length: 1024 }).nullable();
    collection.string('releaseId', { length: 64 }).nullable();
    collection.string('failureCode', { length: 128 }).nullable();
    collection.text('failureMessage').nullable();
    collection.string('createdBy', { length: 64 }).notNull();
    collection.string('credentialId', { length: 64 }).nullable();
    collection.datetime('expiresAt').notNull();
    collection.datetime('uploadedAt').nullable();
    collection.datetime('completedAt').nullable();
    collection.datetime('createdAt').notNull();
    collection.datetime('updatedAt').notNull();
    collection.primary('id', { name: 'pk_hub_release_uploads' });
    collection.index(['applicationId', 'createdAt'], {
      name: 'idx_hub_release_uploads_app_created',
    });
    collection.index(['status', 'expiresAt'], {
      name: 'idx_hub_release_uploads_status_expiry',
    });
    collection.index(['createdBy', 'credentialId'], {
      name: 'idx_hub_release_uploads_actor',
    });
  });
}

async function createRuntimeSecretCollection(
  builder: CollectionBuilder,
): Promise<void> {
  await builder.createCollection('hubRuntimeSecrets', (collection) => {
    collection.string('id', { length: 64 }).notNull();
    collection.string('applicationId', { length: 64 }).notNull();
    collection.integer('version').notNull();
    collection.text('ciphertext').notNull();
    collection.string('nonce', { length: 255 }).notNull();
    collection.string('keyId', { length: 255 }).notNull();
    collection.string('state', { length: 32 }).notNull();
    collection.string('operationId', { length: 128 }).nullable();
    collection.string('failureCode', { length: 128 }).nullable();
    collection.datetime('createdAt').notNull();
    collection.datetime('updatedAt').notNull();
    collection.datetime('rotatedAt').nullable();
    collection.datetime('lastInjectedAt').nullable();
    collection.primary('id', { name: 'pk_hub_runtime_secrets' });
    collection.unique(['applicationId', 'version'], {
      name: 'uq_hub_runtime_secrets_app_version',
    });
    collection.index(['applicationId', 'state'], {
      name: 'idx_hub_runtime_secrets_app_state',
    });
    collection.unique('operationId', {
      name: 'uq_hub_runtime_secrets_operation',
      predicate: { operationId: { $notNull: true } },
    });
  });
}

async function createHealthObservationCollection(
  builder: CollectionBuilder,
): Promise<void> {
  await builder.createCollection('hubHealthObservations', (collection) => {
    collection.string('id', { length: 64 }).notNull();
    collection.string('applicationId', { length: 64 }).notNull();
    collection.string('environmentId', { length: 64 }).notNull();
    collection.string('runtimeId', { length: 128 }).notNull();
    collection.string('releaseId', { length: 64 }).notNull();
    collection.string('health', { length: 32 }).notNull();
    collection.string('failureCode', { length: 128 }).nullable();
    collection.datetime('checkedAt').notNull();
    collection.datetime('expiresAt').notNull();
    collection.primary('id', { name: 'pk_hub_health_observations' });
    collection.unique(['applicationId', 'environmentId'], {
      name: 'uq_hub_health_observations_target',
    });
    collection.index('expiresAt', {
      name: 'idx_hub_health_observations_expiry',
    });
  });
}

async function createAgentDeviceAuthorizationCollection(
  builder: CollectionBuilder,
): Promise<void> {
  await builder.createCollection(
    'hubAgentDeviceAuthorizations',
    (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('deviceCodeHash', { length: 255 }).notNull();
      collection.string('userCodeHash', { length: 255 }).notNull();
      collection.string('clientId', { length: 128 }).notNull();
      collection.string('clientName', { length: 255 }).notNull();
      collection.json('requestedScopes').notNull();
      collection.json('requestedApplicationScope').notNull();
      collection.json('grantedScopes').nullable();
      collection.json('grantedApplicationScope').nullable();
      collection.string('status', { length: 32 }).notNull();
      collection.integer('intervalSeconds').notNull();
      collection.datetime('lastPolledAt').nullable();
      collection.string('userId', { length: 64 }).nullable();
      collection.datetime('expiresAt').notNull();
      collection.datetime('approvedAt').nullable();
      collection.datetime('deniedAt').nullable();
      collection.datetime('consumedAt').nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id', {
        name: 'pk_hub_agent_device_authorizations',
      });
      collection.unique('deviceCodeHash', {
        name: 'uq_hub_agent_device_authorizations_device',
      });
      collection.unique('userCodeHash', {
        name: 'uq_hub_agent_device_authorizations_user',
      });
      collection.index(['status', 'expiresAt'], {
        name: 'idx_hub_agent_device_authorizations_expiry',
      });
    },
  );
}

async function createAgentCredentialCollection(
  builder: CollectionBuilder,
): Promise<void> {
  await builder.createCollection('hubAgentCredentials', (collection) => {
    collection.string('id', { length: 64 }).notNull();
    collection.string('userId', { length: 64 }).notNull();
    collection.string('clientId', { length: 128 }).notNull();
    collection.string('clientName', { length: 255 }).notNull();
    collection.string('accessTokenHash', { length: 255 }).notNull();
    collection.datetime('accessTokenExpiresAt').notNull();
    collection.string('refreshTokenHash', { length: 255 }).notNull();
    collection.string('refreshTokenFamilyHash', { length: 255 }).notNull();
    collection.json('grantedScopes').notNull();
    collection.json('applicationScope').notNull();
    collection.string('status', { length: 32 }).notNull();
    collection.datetime('lastUsedAt').nullable();
    collection.datetime('refreshTokenExpiresAt').notNull();
    collection.datetime('revokedAt').nullable();
    collection.datetime('createdAt').notNull();
    collection.datetime('updatedAt').notNull();
    collection.primary('id', { name: 'pk_hub_agent_credentials' });
    collection.unique('accessTokenHash', {
      name: 'uq_hub_agent_credentials_access_token',
    });
    collection.unique('refreshTokenHash', {
      name: 'uq_hub_agent_credentials_refresh_token',
    });
    collection.index(['userId', 'status'], {
      name: 'idx_hub_agent_credentials_user_status',
    });
    collection.index('refreshTokenFamilyHash', {
      name: 'idx_hub_agent_credentials_family',
    });
  });
}

async function createInvitationCollection(
  builder: CollectionBuilder,
): Promise<void> {
  await builder.createCollection('hubInvitations', (collection) => {
    collection.string('id', { length: 64 }).notNull();
    collection.string('tokenHash', { length: 255 }).notNull();
    collection.string('email', { length: 320 }).notNull();
    collection.json('access').notNull();
    collection.string('status', { length: 32 }).notNull();
    collection.string('invitedBy', { length: 64 }).notNull();
    collection.datetime('expiresAt').notNull();
    collection.string('acceptedBy', { length: 64 }).nullable();
    collection.datetime('acceptedAt').nullable();
    collection.datetime('revokedAt').nullable();
    collection.datetime('createdAt').notNull();
    collection.datetime('updatedAt').notNull();
    collection.primary('id', { name: 'pk_hub_invitations' });
    collection.unique('tokenHash', { name: 'uq_hub_invitations_token' });
    collection.index(['email', 'status'], {
      name: 'idx_hub_invitations_email_status',
    });
    collection.index(['status', 'expiresAt'], {
      name: 'idx_hub_invitations_status_expiry',
    });
  });
}

async function createIdempotencyRecordCollection(
  builder: CollectionBuilder,
): Promise<void> {
  await builder.createCollection('hubIdempotencyRecords', (collection) => {
    collection.string('id', { length: 64 }).notNull();
    collection.string('identityKey', { length: 255 }).notNull();
    collection.string('actorId', { length: 64 }).nullable();
    collection.string('credentialId', { length: 64 }).nullable();
    collection.string('endpoint', { length: 255 }).notNull();
    collection.string('scopeKey', { length: 255 }).notNull();
    collection.string('idempotencyKey', { length: 255 }).notNull();
    collection.string('requestHash', { length: 128 }).notNull();
    collection.json('responseResource').nullable();
    collection.string('status', { length: 32 }).notNull();
    collection.datetime('expiresAt').nullable();
    collection.datetime('createdAt').notNull();
    collection.datetime('updatedAt').notNull();
    collection.primary('id', { name: 'pk_hub_idempotency_records' });
    collection.unique(
      ['identityKey', 'endpoint', 'scopeKey', 'idempotencyKey'],
      { name: 'uq_hub_idempotency_records_request' },
    );
    collection.index('expiresAt', {
      name: 'idx_hub_idempotency_records_expiry',
    });
    collection.index(['actorId', 'credentialId'], {
      name: 'idx_hub_idempotency_records_actor',
    });
  });
}

async function createReleaseRetentionCollection(
  builder: CollectionBuilder,
): Promise<void> {
  await builder.createCollection('hubReleaseRetentions', (collection) => {
    collection.string('releaseId', { length: 64 }).notNull();
    collection.boolean('pinned').notNull().defaultTo(false);
    collection.string('pinnedBy', { length: 64 }).nullable();
    collection.datetime('pinnedAt').nullable();
    collection.datetime('updatedAt').notNull();
    collection.primary('releaseId', { name: 'pk_hub_release_retentions' });
    collection.index(['pinned', 'pinnedAt'], {
      name: 'idx_hub_release_retentions_pinned',
    });
  });
}

async function createMemberStatusCollection(
  builder: CollectionBuilder,
): Promise<void> {
  await builder.createCollection('hubMemberStatuses', (collection) => {
    collection.string('userId', { length: 64 }).notNull();
    collection.string('status', { length: 32 }).notNull();
    collection.datetime('disabledAt').nullable();
    collection.string('disabledBy', { length: 64 }).nullable();
    collection.datetime('lastActiveAt').nullable();
    collection.integer('revision').notNull().defaultTo(1);
    collection.datetime('createdAt').notNull();
    collection.datetime('updatedAt').notNull();
    collection.primary('userId', { name: 'pk_hub_member_statuses' });
    collection.index(['status', 'lastActiveAt'], {
      name: 'idx_hub_member_statuses_status_active',
    });
  });
}

async function createAssignmentRevisionCollection(
  builder: CollectionBuilder,
): Promise<void> {
  await builder.createCollection('hubAssignmentRevisions', (collection) => {
    collection.string('scopeType', { length: 32 }).notNull();
    collection.string('scopeId', { length: 64 }).notNull();
    collection.integer('revision').notNull().defaultTo(1);
    collection.datetime('updatedAt').notNull();
    collection.primary(['scopeType', 'scopeId'], {
      name: 'pk_hub_assignment_revisions',
    });
  });
}

async function backfillMemberStatuses(
  context: MigrationContext,
): Promise<void> {
  const users = await context.query.selectFrom('user').select('id').execute();
  const now = new Date();
  for (const user of users) {
    await context.query
      .insertInto('hubMemberStatuses')
      .values({
        userId: String(user.id),
        status: 'active',
        disabledAt: null,
        disabledBy: null,
        lastActiveAt: null,
        revision: 1,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
  }
}

async function backfillAssignmentRevisions(
  context: MigrationContext,
): Promise<void> {
  const [assignments, applications] = await Promise.all([
    context.query
      .selectFrom('hubRoleAssignments')
      .select(['userId', 'applicationId'])
      .execute(),
    context.query.selectFrom('hubApplications').select('id').execute(),
  ]);
  const now = new Date();
  const members = new Set(assignments.map((row) => identifier(row.userId)));
  const applicationIds = new Set(applications.map((row) => identifier(row.id)));
  for (const assignment of assignments) {
    if (assignment.applicationId !== null) {
      applicationIds.add(identifier(assignment.applicationId));
    }
  }
  for (const memberId of members) {
    await insertAssignmentRevision(context, 'member', memberId, now);
  }
  for (const applicationId of applicationIds) {
    await insertAssignmentRevision(context, 'application', applicationId, now);
  }
}

async function insertAssignmentRevision(
  context: MigrationContext,
  scopeType: 'application' | 'member',
  scopeId: string,
  updatedAt: Date,
): Promise<void> {
  await context.query
    .insertInto('hubAssignmentRevisions')
    .values({ scopeType, scopeId, revision: 1, updatedAt })
    .execute();
}

function identifier(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'bigint') {
    return String(value);
  }
  throw new TypeError('Expected a scalar database identifier.');
}

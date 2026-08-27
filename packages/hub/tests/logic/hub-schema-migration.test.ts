// @vitest-environment node

import { copyFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import type { Knex } from 'knex';

import {
  createHubDatabase,
  type HubDatabaseRuntime,
} from '../../server/hub/database.ts';

const packageRoot = fileURLToPath(new URL('../..', import.meta.url));
const migrationsRoot = path.join(packageRoot, 'server/hub/migrations');
const baselineMigrationFiles = [
  '202608200001_create_authentication_tables.ts',
  '202608210001_create_hub_tables.ts',
] as const;
const databases: HubDatabaseRuntime[] = [];
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(databases.splice(0).map((database) => database.close()));
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('Hub application-management schema migration', () => {
  it('upgrades the existing Hub schema without losing persisted resources', async () => {
    const testRoot = await mkdtemp(
      path.join(packageRoot, '.hub-schema-migration-'),
    );
    temporaryDirectories.push(testRoot);
    const baselineMigrations = path.join(testRoot, 'baseline-migrations');
    await mkdir(baselineMigrations, { recursive: true });
    await Promise.all(
      baselineMigrationFiles.map((fileName) =>
        copyFile(
          path.join(migrationsRoot, fileName),
          path.join(baselineMigrations, fileName),
        ),
      ),
    );

    const filename = path.join(testRoot, 'hub.sqlite');
    const baseline = createHubDatabase({
      filename,
      migrationsDirectory: baselineMigrations,
    });
    databases.push(baseline);
    await baseline.ready;
    const now = new Date('2026-08-25T08:00:00.000Z');
    await baseline.connection.query
      .insertInto('user')
      .values({
        id: 'member-1',
        name: 'Existing member',
        username: 'existing',
        email: 'existing@example.com',
        emailVerified: true,
        image: null,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    await baseline.connection.query
      .insertInto('hubApplications')
      .values({
        id: 'app-1',
        slug: 'existing-app',
        name: 'Existing app',
        description: null,
        status: 'active',
        defaultEnvironmentId: 'default',
        activeReleaseId: null,
        createdBy: 'member-1',
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    await baseline.connection.query
      .insertInto('hubRoleAssignments')
      .values({
        id: 'assignment-1',
        userId: 'member-1',
        role: 'owner',
        applicationId: null,
        disabled: false,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    await baseline.connection.query
      .insertInto('hubSettings')
      .values({ key: 'existing.setting', value: 'kept', updatedAt: now })
      .execute();
    await baseline.close();
    databases.splice(databases.indexOf(baseline), 1);

    const upgraded = createHubDatabase({ filename });
    databases.push(upgraded);
    await upgraded.ready;

    const knex = await upgraded.connection.client<Knex>();
    const expectedSchema: Readonly<Record<string, readonly string[]>> = {
      hubReleaseUploads: [
        'id',
        'applicationId',
        'version',
        'checksum',
        'sizeBytes',
        'archiveChecksum',
        'archiveSizeBytes',
        'archiveFormat',
        'manifest',
        'status',
        'storageKey',
        'releaseId',
        'failureCode',
        'failureMessage',
        'createdBy',
        'credentialId',
        'expiresAt',
        'uploadedAt',
        'completedAt',
        'createdAt',
        'updatedAt',
      ],
      hubRuntimeSecrets: [
        'id',
        'applicationId',
        'version',
        'ciphertext',
        'nonce',
        'keyId',
        'state',
        'operationId',
        'failureCode',
        'createdAt',
        'updatedAt',
        'rotatedAt',
        'lastInjectedAt',
      ],
      hubHealthObservations: [
        'id',
        'applicationId',
        'environmentId',
        'runtimeId',
        'releaseId',
        'health',
        'failureCode',
        'checkedAt',
        'expiresAt',
      ],
      hubAgentDeviceAuthorizations: [
        'id',
        'deviceCodeHash',
        'userCodeHash',
        'clientId',
        'clientName',
        'requestedScopes',
        'requestedApplicationScope',
        'grantedScopes',
        'grantedApplicationScope',
        'status',
        'intervalSeconds',
        'lastPolledAt',
        'userId',
        'expiresAt',
        'approvedAt',
        'deniedAt',
        'consumedAt',
        'createdAt',
        'updatedAt',
      ],
      hubAgentCredentials: [
        'id',
        'userId',
        'clientId',
        'clientName',
        'accessTokenHash',
        'accessTokenExpiresAt',
        'refreshTokenHash',
        'refreshTokenFamilyHash',
        'grantedScopes',
        'applicationScope',
        'status',
        'lastUsedAt',
        'refreshTokenExpiresAt',
        'revokedAt',
        'createdAt',
        'updatedAt',
      ],
      hubInvitations: [
        'id',
        'tokenHash',
        'email',
        'access',
        'status',
        'invitedBy',
        'expiresAt',
        'acceptedBy',
        'acceptedAt',
        'revokedAt',
        'createdAt',
        'updatedAt',
      ],
      hubIdempotencyRecords: [
        'id',
        'identityKey',
        'actorId',
        'credentialId',
        'endpoint',
        'scopeKey',
        'idempotencyKey',
        'requestHash',
        'responseResource',
        'status',
        'expiresAt',
        'createdAt',
        'updatedAt',
      ],
      hubReleaseRetentions: [
        'releaseId',
        'pinned',
        'pinnedBy',
        'pinnedAt',
        'updatedAt',
      ],
      hubMemberStatuses: [
        'userId',
        'status',
        'disabledAt',
        'disabledBy',
        'lastActiveAt',
        'revision',
        'createdAt',
        'updatedAt',
      ],
      hubAssignmentRevisions: ['scopeType', 'scopeId', 'revision', 'updatedAt'],
    };

    for (const [table, columns] of Object.entries(expectedSchema)) {
      const physicalTable = snakeCase(table);
      expect(await knex.schema.hasTable(physicalTable)).toBe(true);
      const columnInfo = await knex(physicalTable).columnInfo();
      expect(Object.keys(columnInfo)).toEqual(
        expect.arrayContaining(columns.map(snakeCase)),
      );
    }

    await expect(
      upgraded.connection.query
        .selectFrom('hubApplications')
        .selectAll()
        .where('id', '=', 'app-1')
        .executeTakeFirstOrThrow(),
    ).resolves.toMatchObject({
      id: 'app-1',
      name: 'Existing app',
      isDefault: 0,
      revision: 1,
      desiredRuntimeState: 'stopped',
    });
    await expect(
      upgraded.connection.query
        .selectFrom('hubSettings')
        .selectAll()
        .where('key', '=', 'existing.setting')
        .executeTakeFirstOrThrow(),
    ).resolves.toMatchObject({ value: 'kept', revision: 1 });
    await expect(
      upgraded.connection.query
        .selectFrom('hubMemberStatuses')
        .selectAll()
        .where('userId', '=', 'member-1')
        .executeTakeFirstOrThrow(),
    ).resolves.toMatchObject({
      userId: 'member-1',
      status: 'active',
      revision: 1,
    });
    await expect(
      upgraded.connection.query
        .selectFrom('hubAssignmentRevisions')
        .selectAll()
        .orderBy('scopeType', 'asc')
        .execute(),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          scopeType: 'application',
          scopeId: 'app-1',
          revision: 1,
        }),
        expect.objectContaining({
          scopeType: 'member',
          scopeId: 'member-1',
          revision: 1,
        }),
      ]),
    );

    const auditColumns = await knex(snakeCase('hubAuditLogs')).columnInfo();
    expect(Object.keys(auditColumns)).toEqual(
      expect.arrayContaining(
        ['applicationId', 'result', 'source', 'client', 'failureCode'].map(
          snakeCase,
        ),
      ),
    );
  });
});

function snakeCase(value: string): string {
  return value.replaceAll(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
}

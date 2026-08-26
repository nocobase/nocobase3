import type {
  DatabaseConnection,
  Row,
  SelectQuery,
} from '@nocobase/app-database';

import { HubDomainError } from './store.ts';
import type { DesiredRuntimeState } from './types.ts';

const SETTINGS_KEY = 'hub.management.settings';
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const DEFAULT_SETTINGS: HubSettings = {
  releaseRetention: {
    automaticCleanupEnabled: false,
    keepPerApplication: 10,
    minimumAgeDays: 30,
  },
  audit: {
    recordDeniedMutations: true,
    retentionDays: 365,
  },
  confirmation: {
    rollback: true,
    archiveApplication: true,
    rotateRuntimeSecret: true,
  },
  revision: 1,
  updatedAt: null,
};

export interface ManagementRoleDefinition {
  readonly id: string;
  readonly scopes: readonly ('global' | 'application')[];
  readonly preservesOwnership?: boolean;
  readonly descriptionKey?: string;
  readonly capabilities?: readonly string[];
}

export interface HubManagementStoreOptions {
  readonly roles: readonly ManagementRoleDefinition[];
}

export interface ManagementPage<T> {
  readonly items: T[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

export type ApplicationManagementStatus = 'active' | 'archived';
export type ApplicationSort =
  | 'name'
  | '-name'
  | 'slug'
  | '-slug'
  | 'createdAt'
  | '-createdAt'
  | 'updatedAt'
  | '-updatedAt';

export interface ApplicationListOptions {
  readonly applicationIds?: readonly string[];
  readonly query?: string;
  readonly statuses?: readonly ApplicationManagementStatus[];
  readonly sort?: ApplicationSort;
  readonly limit?: number;
  readonly offset?: number;
}

export interface ManagedApplication {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly description: string | null;
  readonly status: ApplicationManagementStatus;
  readonly desiredRuntimeState: DesiredRuntimeState;
  readonly isDefault: boolean;
  readonly revision: number;
  readonly defaultEnvironmentId: string;
  readonly activeReleaseId: string | null;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ApplicationPatch {
  readonly name?: string;
  readonly description?: string | null;
}

export interface ApplicationMutationResult {
  readonly application: ManagedApplication;
  readonly idempotent: boolean;
}

export type RuntimeStateMutationResult = ApplicationMutationResult;

export interface RepositoryMetadata {
  readonly id: string;
  readonly applicationId: string;
  readonly provider: string;
  readonly defaultBranch: string;
  readonly headCommit: string | null;
  readonly status: string;
  readonly initialCommit: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface RepositoryMetadataInput {
  readonly provider: string;
  readonly defaultBranch: string;
  readonly headCommit?: string | null;
  readonly status: string;
  readonly initialCommit?: string | null;
}

export interface RepositoryMetadataPatch {
  readonly defaultBranch?: string;
  readonly headCommit?: string | null;
  readonly status?: string;
  readonly initialCommit?: string | null;
}

export interface PublicReleaseRetention {
  readonly pinned: boolean;
  readonly pinnedBy: string | null;
  readonly pinnedAt: string | null;
}

export interface PublicRelease {
  readonly id: string;
  readonly applicationId: string;
  readonly version: string;
  readonly checksum: string;
  readonly manifest: Record<string, unknown>;
  readonly sizeBytes: number | null;
  readonly sourceCommit: string | null;
  readonly verificationStatus: string;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly retention: PublicReleaseRetention;
}

export interface ReleaseListOptions {
  readonly query?: string;
  readonly sourceCommit?: string;
  readonly sort?: 'version' | '-version' | 'createdAt' | '-createdAt';
  readonly limit?: number;
  readonly offset?: number;
}

export interface ReleaseMutationResult {
  readonly release: PublicRelease;
  readonly idempotent: boolean;
}

export type MemberStatus = 'active' | 'disabled';
export type MemberSort =
  | 'name'
  | '-name'
  | 'createdAt'
  | '-createdAt'
  | 'lastActiveAt'
  | '-lastActiveAt';

export interface ManagedMember {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly username: string | null;
  readonly status: MemberStatus;
  readonly roles: readonly string[];
  readonly applicationIds: readonly string[];
  readonly lastActiveAt: string | null;
  readonly createdAt: string;
  readonly revision: number;
}

export interface MemberListOptions {
  readonly query?: string;
  readonly status?: MemberStatus;
  readonly role?: string;
  readonly applicationId?: string;
  readonly sort?: MemberSort;
  readonly limit?: number;
  readonly offset?: number;
}

export interface MemberStatusMutationResult {
  readonly member: ManagedMember;
  readonly idempotent: boolean;
}

export interface MemberAccess {
  readonly revision: number;
  readonly globalRoles: readonly string[];
  readonly applications: readonly {
    applicationId: string;
    roles: readonly string[];
  }[];
}

export interface ApplicationAccessItem {
  readonly member: Pick<
    ManagedMember,
    'id' | 'name' | 'email' | 'username' | 'status' | 'createdAt'
  >;
  readonly roles: readonly string[];
}

export interface ApplicationAccessListOptions {
  readonly query?: string;
  readonly status?: MemberStatus;
  readonly role?: string;
  readonly sort?: 'name' | '-name' | 'createdAt' | '-createdAt';
  readonly limit?: number;
  readonly offset?: number;
}

export interface ApplicationAccessPage extends ManagementPage<ApplicationAccessItem> {
  readonly revision: number;
}

export interface MemberAccessInput {
  readonly globalRoles: readonly string[];
  readonly applications: readonly {
    applicationId: string;
    roles: readonly string[];
  }[];
}

export interface AuditClientSummary {
  readonly credentialId?: string | null;
  readonly name?: string | null;
  readonly ip?: string | null;
}

export type AuditResult = 'success' | 'failure' | 'denied';
export type AuditSource = 'web' | 'agent' | 'git' | 'system';

export interface AuditLogInput {
  readonly actorId?: string | null;
  readonly applicationId?: string | null;
  readonly action: string;
  readonly resource: string;
  readonly resourceId?: string | null;
  readonly result: AuditResult;
  readonly source: AuditSource;
  readonly client?: AuditClientSummary | null;
  readonly failureCode?: string | null;
  readonly details: Record<string, unknown>;
  readonly requestId?: string | null;
}

export interface PublicAuditLog {
  readonly id: string;
  readonly actorId: string | null;
  readonly applicationId: string | null;
  readonly action: string;
  readonly resource: string;
  readonly resourceId: string | null;
  readonly result: AuditResult;
  readonly source: AuditSource;
  readonly client: AuditClientSummary | null;
  readonly failureCode: string | null;
  readonly details: Record<string, unknown>;
  readonly requestId: string | null;
  readonly createdAt: string;
  readonly actor?: { id: string; name: string; email: string } | null;
  readonly application?: { id: string; slug: string; name: string } | null;
}

export interface AuditListOptions {
  readonly applicationIds?: readonly string[];
  readonly applicationId?: string;
  readonly actorId?: string;
  readonly action?: string | readonly string[];
  readonly resource?: string;
  readonly resourceId?: string;
  readonly result?: AuditResult;
  readonly source?: AuditSource;
  readonly query?: string;
  readonly from?: Date;
  readonly to?: Date;
  readonly sort?: 'createdAt' | '-createdAt';
  readonly limit?: number;
  readonly offset?: number;
}

export interface HubSettings {
  readonly releaseRetention: {
    readonly automaticCleanupEnabled: false;
    readonly keepPerApplication: number;
    readonly minimumAgeDays: number;
  };
  readonly audit: {
    readonly recordDeniedMutations: boolean;
    readonly retentionDays: number;
  };
  readonly confirmation: {
    readonly rollback: boolean;
    readonly archiveApplication: boolean;
    readonly rotateRuntimeSecret: boolean;
  };
  readonly revision: number;
  readonly updatedAt: string | null;
}

export interface HubSettingsPatch {
  readonly releaseRetention?: {
    readonly automaticCleanupEnabled?: boolean;
    readonly keepPerApplication?: number;
    readonly minimumAgeDays?: number;
  };
  readonly audit?: {
    readonly recordDeniedMutations?: boolean;
    readonly retentionDays?: number;
  };
  readonly confirmation?: {
    readonly rollback?: boolean;
    readonly archiveApplication?: boolean;
    readonly rotateRuntimeSecret?: boolean;
  };
}

export interface StorageCleanupCandidate {
  readonly id: string;
  readonly applicationId: string;
  readonly version: string;
  readonly sizeBytes: number;
  readonly createdAt: string;
}

export interface StorageCleanupPlanData {
  readonly automaticCleanupEnabled: false;
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
  readonly totalReclaimableBytes: number;
  readonly protectedCounts: {
    readonly activeRelease: number;
    readonly deploymentReference: number;
    readonly pinned: number;
  };
  readonly measuredAt: string;
  readonly releaseCandidates: readonly StorageCleanupCandidate[];
}

interface DbApplicationRow extends Row {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  status: string;
  desiredRuntimeState: string;
  isDefault: boolean | number;
  revision: number;
  defaultEnvironmentId: string;
  activeReleaseId: string | null;
  createdBy: string;
  createdAt: Date | string;
  updatedAt: Date | string;
}

interface DbRepositoryRow extends Row {
  id: string;
  applicationId: string;
  provider: string;
  defaultBranch: string;
  headCommit: string | null;
  status: string;
  initialCommit: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

interface DbReleaseRow extends Row {
  id: string;
  applicationId: string;
  version: string;
  checksum: string;
  manifest: string | Record<string, unknown>;
  storageKey: string | null;
  sizeBytes: number | string | null;
  sourceCommit: string | null;
  verificationStatus: string;
  createdBy: string;
  createdAt: Date | string;
}

interface DbMemberRow extends Row {
  id: string;
  name: string;
  email: string;
  username: string | null;
  createdAt: Date | string;
  status: string | null;
  lastActiveAt: Date | string | null;
  memberRevision: number | null;
}

interface DbAuditRow extends Row {
  id: string;
  actorId: string | null;
  applicationId: string | null;
  action: string;
  resource: string;
  resourceId: string | null;
  result: string;
  source: string;
  client: string | AuditClientSummary | null;
  failureCode: string | null;
  details: string | Record<string, unknown>;
  requestId: string | null;
  createdAt: Date | string;
}

interface DbSettingsRow extends Row {
  key: string;
  value: string | null;
  revision: number | null;
  updatedAt: Date | string;
}

export class HubManagementStore {
  private readonly rolesById: ReadonlyMap<string, ManagementRoleDefinition>;
  private readonly ownershipRoleIds: ReadonlySet<string>;

  constructor(
    private readonly connection: DatabaseConnection,
    options: HubManagementStoreOptions,
  ) {
    this.rolesById = new Map(options.roles.map((role) => [role.id, role]));
    this.ownershipRoleIds = new Set(
      options.roles
        .filter((role) => role.preservesOwnership)
        .map((role) => role.id),
    );
  }

  listRoles(): readonly ManagementRoleDefinition[] {
    return [...this.rolesById.values()];
  }

  async listApplications(
    options: ApplicationListOptions = {},
  ): Promise<ManagementPage<ManagedApplication>> {
    const pagination = normalizePagination(options);
    if (options.applicationIds?.length === 0) {
      return { items: [], total: 0, ...pagination };
    }
    const [rows, total] = await Promise.all([
      this.applyApplicationFilters(
        this.connection.query
          .selectFrom<DbApplicationRow>('hubApplications')
          .selectAll(),
        options,
      )
        .orderBy(...applicationOrder(options.sort))
        .limit(pagination.limit)
        .offset(pagination.offset)
        .execute<DbApplicationRow>(),
      this.countApplications(options),
    ]);
    return {
      items: rows.map(toApplication),
      total,
      ...pagination,
    };
  }

  async getApplication(id: string): Promise<ManagedApplication | undefined> {
    const row = await this.connection.query
      .selectFrom<DbApplicationRow>('hubApplications')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst<DbApplicationRow>();
    return row ? toApplication(row) : undefined;
  }

  async getApplicationBySlug(
    slug: string,
  ): Promise<ManagedApplication | undefined> {
    const row = await this.connection.query
      .selectFrom<DbApplicationRow>('hubApplications')
      .selectAll()
      .where('slug', '=', slug)
      .executeTakeFirst<DbApplicationRow>();
    return row ? toApplication(row) : undefined;
  }

  /** Returns the single system-designated default application, if bootstrap has created it. */
  async getDefaultApplication(): Promise<ManagedApplication | undefined> {
    const row = await this.connection.query
      .selectFrom<DbApplicationRow>('hubApplications')
      .selectAll()
      .where('isDefault', '=', true)
      .executeTakeFirst<DbApplicationRow>();
    return row ? toApplication(row) : undefined;
  }

  async updateApplication(
    id: string,
    patch: ApplicationPatch,
    expectedRevision: number,
  ): Promise<ManagedApplication> {
    return this.connection.transaction(async (connection) => {
      const current = await this.requireApplicationWithConnection(
        connection,
        id,
      );
      assertRevision(current.revision, expectedRevision);
      const name =
        patch.name === undefined
          ? current.name
          : requireText(patch.name, 'name', 255);
      const description =
        patch.description === undefined
          ? current.description
          : normalizeDescription(patch.description);
      if (name === current.name && description === current.description) {
        return current;
      }
      const result = await connection.query
        .updateTable<DbApplicationRow>('hubApplications')
        .set({
          name,
          description,
          revision: expectedRevision + 1,
          updatedAt: new Date(),
        })
        .where('id', '=', id)
        .where('revision', '=', expectedRevision)
        .execute();
      if (result.updatedCount !== 1) throw revisionMismatch();
      return this.requireApplicationWithConnection(connection, id);
    });
  }

  async archiveApplication(
    id: string,
    expectedRevision: number,
  ): Promise<ApplicationMutationResult> {
    return this.setApplicationStatus(id, 'archived', expectedRevision);
  }

  async restoreApplication(
    id: string,
    expectedRevision: number,
  ): Promise<ApplicationMutationResult> {
    return this.setApplicationStatus(id, 'active', expectedRevision);
  }

  async setDesiredRuntimeState(
    id: string,
    desiredRuntimeState: DesiredRuntimeState,
  ): Promise<RuntimeStateMutationResult> {
    const current = await this.requireApplication(id);
    if (current.desiredRuntimeState === desiredRuntimeState) {
      return { application: current, idempotent: true };
    }
    const result = await this.connection.query
      .updateTable<DbApplicationRow>('hubApplications')
      .set({ desiredRuntimeState, updatedAt: new Date() })
      .where('id', '=', id)
      .where('desiredRuntimeState', '=', current.desiredRuntimeState)
      .execute();
    if (result.updatedCount !== 1) {
      throw conflict(
        'RUNTIME_STATE_CONFLICT',
        'The desired runtime state changed concurrently.',
      );
    }
    return {
      application: await this.requireApplication(id),
      idempotent: false,
    };
  }

  async createRepository(
    applicationId: string,
    input: RepositoryMetadataInput,
  ): Promise<RepositoryMetadata> {
    await this.requireApplication(applicationId);
    const existing = await this.getRepository(applicationId);
    if (existing)
      throw conflict('REPOSITORY_ALREADY_EXISTS', 'Repository already exists.');
    const now = new Date();
    const row: DbRepositoryRow = {
      id: crypto.randomUUID(),
      applicationId,
      provider: requireText(input.provider, 'provider', 32),
      defaultBranch: requireText(input.defaultBranch, 'defaultBranch', 255),
      headCommit: normalizeOptional(input.headCommit),
      status: requireText(input.status, 'status', 32),
      initialCommit: normalizeOptional(input.initialCommit),
      createdAt: now,
      updatedAt: now,
    };
    await this.connection.query
      .insertInto<DbRepositoryRow>('hubRepositories')
      .values(row)
      .execute();
    return toRepository(row);
  }

  async getRepository(
    applicationId: string,
  ): Promise<RepositoryMetadata | undefined> {
    const row = await this.connection.query
      .selectFrom<DbRepositoryRow>('hubRepositories')
      .selectAll()
      .where('applicationId', '=', applicationId)
      .executeTakeFirst<DbRepositoryRow>();
    return row ? toRepository(row) : undefined;
  }

  async updateRepository(
    applicationId: string,
    patch: RepositoryMetadataPatch,
  ): Promise<RepositoryMetadata> {
    await this.requireApplication(applicationId);
    const current = await this.getRepository(applicationId);
    if (!current)
      throw notFound('REPOSITORY_NOT_FOUND', 'Repository was not found.');
    const row = {
      defaultBranch:
        patch.defaultBranch === undefined
          ? current.defaultBranch
          : requireText(patch.defaultBranch, 'defaultBranch', 255),
      headCommit:
        patch.headCommit === undefined
          ? current.headCommit
          : normalizeOptional(patch.headCommit),
      status:
        patch.status === undefined
          ? current.status
          : requireText(patch.status, 'status', 32),
      initialCommit:
        patch.initialCommit === undefined
          ? current.initialCommit
          : normalizeOptional(patch.initialCommit),
      updatedAt: new Date(),
    };
    await this.connection.query
      .updateTable<DbRepositoryRow>('hubRepositories')
      .set(row)
      .where('applicationId', '=', applicationId)
      .execute();
    const updated = await this.getRepository(applicationId);
    if (!updated)
      throw notFound('REPOSITORY_NOT_FOUND', 'Repository was not found.');
    return updated;
  }

  async deleteRepository(applicationId: string): Promise<boolean> {
    const result = await this.connection.query
      .deleteFrom<DbRepositoryRow>('hubRepositories')
      .where('applicationId', '=', applicationId)
      .execute();
    return result.deletedCount === 1;
  }

  async listReleases(
    applicationId: string,
    options: ReleaseListOptions = {},
  ): Promise<ManagementPage<PublicRelease>> {
    await this.requireApplication(applicationId);
    const pagination = normalizePagination(options);
    let query = this.connection.query
      .selectFrom<DbReleaseRow>('hubReleases')
      .selectAll()
      .where('applicationId', '=', applicationId);
    if (options.query)
      query = query.where('version', 'like', `%${escapeLike(options.query)}%`);
    if (options.sourceCommit)
      query = query.where('sourceCommit', '=', options.sourceCommit);
    const [rows, total] = await Promise.all([
      query
        .orderBy(...releaseOrder(options.sort))
        .limit(pagination.limit)
        .offset(pagination.offset)
        .execute<DbReleaseRow>(),
      this.countReleases(applicationId, options),
    ]);
    const releases = await Promise.all(
      rows.map((row) => this.toPublicRelease(row)),
    );
    return { items: releases, total, ...pagination };
  }

  async getRelease(
    applicationId: string,
    releaseId: string,
  ): Promise<PublicRelease | undefined> {
    const row = await this.connection.query
      .selectFrom<DbReleaseRow>('hubReleases')
      .selectAll()
      .where('id', '=', releaseId)
      .where('applicationId', '=', applicationId)
      .executeTakeFirst<DbReleaseRow>();
    return row ? this.toPublicRelease(row) : undefined;
  }

  async pinRelease(
    applicationId: string,
    releaseId: string,
    actorId: string,
  ): Promise<ReleaseMutationResult> {
    const release = await this.requireRelease(applicationId, releaseId);
    const existing = await this.getRetention(releaseId);
    if (existing?.pinned) return { release, idempotent: true };
    const now = new Date();
    if (existing) {
      await this.connection.query
        .updateTable('hubReleaseRetentions')
        .set({ pinned: true, pinnedBy: actorId, pinnedAt: now, updatedAt: now })
        .where('releaseId', '=', releaseId)
        .execute();
    } else {
      await this.connection.query
        .insertInto('hubReleaseRetentions')
        .values({
          releaseId,
          pinned: true,
          pinnedBy: actorId,
          pinnedAt: now,
          updatedAt: now,
        })
        .execute();
    }
    const updated = await this.requireRelease(applicationId, releaseId);
    return { release: updated, idempotent: false };
  }

  async unpinRelease(
    applicationId: string,
    releaseId: string,
  ): Promise<ReleaseMutationResult> {
    const release = await this.requireRelease(applicationId, releaseId);
    const existing = await this.getRetention(releaseId);
    if (!existing?.pinned) return { release, idempotent: true };
    const now = new Date();
    await this.connection.query
      .updateTable('hubReleaseRetentions')
      .set({ pinned: false, pinnedBy: null, pinnedAt: null, updatedAt: now })
      .where('releaseId', '=', releaseId)
      .execute();
    return {
      release: await this.requireRelease(applicationId, releaseId),
      idempotent: false,
    };
  }

  async listMembers(
    options: MemberListOptions = {},
  ): Promise<ManagementPage<ManagedMember>> {
    const pagination = normalizePagination(options);
    let query = this.connection.query
      .selectFrom<DbMemberRow>('user')
      .leftJoin('hubMemberStatuses', 'user.id', 'hubMemberStatuses.userId')
      .select([
        'user.id as id',
        'user.name as name',
        'user.email as email',
        'user.username as username',
        'user.createdAt as createdAt',
        'hubMemberStatuses.status as status',
        'hubMemberStatuses.lastActiveAt as lastActiveAt',
        'hubMemberStatuses.revision as memberRevision',
      ]);
    if (options.query) {
      const pattern = `%${escapeLike(options.query)}%`;
      query = query.where((eb) =>
        eb.or([
          eb('user.name', 'like', pattern),
          eb('user.email', 'like', pattern),
          eb('user.username', 'like', pattern),
        ]),
      );
    }
    if (options.status)
      query = query.where('hubMemberStatuses.status', '=', options.status);
    const rows = await query.execute<DbMemberRow>();
    const members = await this.enrichMembers(rows);
    const filtered = members.filter((member) => {
      if (options.role && !member.roles.includes(options.role)) return false;
      if (
        options.applicationId &&
        !member.applicationIds.includes(options.applicationId)
      ) {
        return false;
      }
      return true;
    });
    const sorted = [...filtered].sort((left, right) =>
      compareMembers(left, right, options.sort),
    );
    const items = sorted.slice(
      pagination.offset,
      pagination.offset + pagination.limit,
    );
    return { items, total: filtered.length, ...pagination };
  }

  async getMember(id: string): Promise<ManagedMember | undefined> {
    const rows = await this.connection.query
      .selectFrom<DbMemberRow>('user')
      .leftJoin('hubMemberStatuses', 'user.id', 'hubMemberStatuses.userId')
      .select([
        'user.id as id',
        'user.name as name',
        'user.email as email',
        'user.username as username',
        'user.createdAt as createdAt',
        'hubMemberStatuses.status as status',
        'hubMemberStatuses.lastActiveAt as lastActiveAt',
        'hubMemberStatuses.revision as memberRevision',
      ])
      .where('user.id', '=', id)
      .execute<DbMemberRow>();
    const members = await this.enrichMembers(rows);
    return members[0];
  }

  async updateMemberStatus(
    id: string,
    status: MemberStatus,
    expectedRevision: number,
    actorId: string,
  ): Promise<MemberStatusMutationResult> {
    return this.connection.transaction(async (connection) => {
      const member = await this.requireMemberStatus(connection, id);
      assertRevision(member.revision, expectedRevision);
      if (status === member.status) {
        const current = await this.getMemberWithConnection(connection, id);
        if (!current)
          throw notFound('MEMBER_NOT_FOUND', 'Member was not found.');
        return { member: current, idempotent: true };
      }
      if (
        status === 'disabled' &&
        (await this.isOnlyActiveOwner(connection, id))
      ) {
        throw conflict(
          'LAST_OWNER_REQUIRED',
          'The last owner cannot be disabled.',
        );
      }
      const now = new Date();
      const result = await connection.query
        .updateTable('hubMemberStatuses')
        .set({
          status,
          disabledAt: status === 'disabled' ? now : null,
          disabledBy: status === 'disabled' ? actorId : null,
          revision: expectedRevision + 1,
          updatedAt: now,
        })
        .where('userId', '=', id)
        .where('revision', '=', expectedRevision)
        .execute();
      if (result.updatedCount !== 1) throw revisionMismatch();
      const updated = await this.getMemberWithConnection(connection, id);
      if (!updated) throw notFound('MEMBER_NOT_FOUND', 'Member was not found.');
      return { member: updated, idempotent: false };
    });
  }

  async getMemberAccess(id: string): Promise<MemberAccess> {
    return this.getMemberAccessWithConnection(this.connection, id);
  }

  private async getMemberAccessWithConnection(
    connection: DatabaseConnection,
    id: string,
  ): Promise<MemberAccess> {
    await this.requireMemberWithConnection(connection, id);
    const revision = await this.ensureAssignmentRevision(
      'member',
      id,
      connection,
    );
    const rows = await connection.query
      .selectFrom('hubRoleAssignments')
      .select(['role', 'applicationId'])
      .where('userId', '=', id)
      .where('disabled', '=', false)
      .execute<{ role: string; applicationId: string | null }>();
    return groupAccess(rows, revision);
  }

  async replaceMemberAccess(
    id: string,
    access: MemberAccessInput,
    expectedRevision: number,
  ): Promise<MemberAccess> {
    return this.connection.transaction(async (connection) => {
      await this.requireMemberWithConnection(connection, id);
      const revision = await this.ensureAssignmentRevision(
        'member',
        id,
        connection,
      );
      assertRevision(revision, expectedRevision);
      const normalized = this.normalizeMemberAccess(access);
      if (
        !normalized.globalRoles.some((role) =>
          this.ownershipRoleIds.has(role),
        ) &&
        (await this.isOnlyActiveOwner(connection, id))
      ) {
        throw conflict(
          'LAST_OWNER_REQUIRED',
          'The last owner assignment cannot be removed.',
        );
      }
      const previousAssignments = await connection.query
        .selectFrom('hubRoleAssignments')
        .select('applicationId')
        .where('userId', '=', id)
        .where('applicationId', 'is not', null)
        .where('disabled', '=', false)
        .execute<{ applicationId: string }>();
      const affectedApplicationIds = new Set([
        ...previousAssignments.map((row) => row.applicationId),
        ...normalized.applications.map(
          (application) => application.applicationId,
        ),
      ]);
      const applicationRevisions = new Map<string, number>();
      for (const applicationId of affectedApplicationIds) {
        applicationRevisions.set(
          applicationId,
          await this.ensureAssignmentRevision(
            'application',
            applicationId,
            connection,
          ),
        );
      }
      await connection.query
        .deleteFrom('hubRoleAssignments')
        .where('userId', '=', id)
        .execute();
      await this.insertAccessAssignments(connection, id, normalized);
      await this.bumpAssignmentRevision(
        'member',
        id,
        expectedRevision,
        connection,
      );
      for (const [applicationId, applicationRevision] of applicationRevisions) {
        await this.bumpAssignmentRevision(
          'application',
          applicationId,
          applicationRevision,
          connection,
        );
      }
      return this.getMemberAccessWithConnection(connection, id);
    });
  }

  async listApplicationAccess(
    applicationId: string,
    options: ApplicationAccessListOptions = {},
  ): Promise<ApplicationAccessPage> {
    await this.requireApplication(applicationId);
    const pagination = normalizePagination(options);
    const revision = await this.ensureAssignmentRevision(
      'application',
      applicationId,
    );
    const rows = await this.connection.query
      .selectFrom('hubRoleAssignments')
      .select(['userId', 'role'])
      .where('applicationId', '=', applicationId)
      .where('disabled', '=', false)
      .execute<{ userId: string; role: string }>();
    const grouped = new Map<string, string[]>();
    for (const row of rows)
      grouped.set(row.userId, [...(grouped.get(row.userId) ?? []), row.role]);
    const members: Array<ApplicationAccessItem | undefined> = await Promise.all(
      [...grouped].map(async ([userId, memberRoles]) => {
        const member = await this.getMember(userId);
        if (!member) return undefined;
        return {
          member: {
            id: member.id,
            name: member.name,
            email: member.email,
            username: member.username,
            status: member.status,
            createdAt: member.createdAt,
          },
          roles: memberRoles,
        };
      }),
    );
    const items = members
      .filter((item): item is ApplicationAccessItem => item !== undefined)
      .filter((item) => applicationAccessMatches(item, options))
      .sort((left, right) =>
        compareApplicationAccess(left, right, options.sort),
      );
    return {
      items: items.slice(
        pagination.offset,
        pagination.offset + pagination.limit,
      ),
      total: items.length,
      revision,
      ...pagination,
    };
  }

  async replaceApplicationMemberAccess(
    applicationId: string,
    memberId: string,
    roles: readonly string[],
    expectedRevision: number,
  ): Promise<{ revision: number; roles: readonly string[] }> {
    return this.connection.transaction(async (connection) => {
      await this.requireApplicationWithConnection(connection, applicationId);
      await this.requireMemberWithConnection(connection, memberId);
      const revision = await this.ensureAssignmentRevision(
        'application',
        applicationId,
        connection,
      );
      assertRevision(revision, expectedRevision);
      const memberRevision = await this.ensureAssignmentRevision(
        'member',
        memberId,
        connection,
      );
      const normalizedRoles = this.normalizeApplicationRoles(roles);
      await connection.query
        .deleteFrom('hubRoleAssignments')
        .where('userId', '=', memberId)
        .where('applicationId', '=', applicationId)
        .execute();
      for (const role of normalizedRoles) {
        await connection.query
          .insertInto('hubRoleAssignments')
          .values({
            id: crypto.randomUUID(),
            userId: memberId,
            role,
            applicationId,
            disabled: false,
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .execute();
      }
      const nextRevision = await this.bumpAssignmentRevision(
        'application',
        applicationId,
        expectedRevision,
        connection,
      );
      await this.bumpAssignmentRevision(
        'member',
        memberId,
        memberRevision,
        connection,
      );
      return { revision: nextRevision, roles: normalizedRoles };
    });
  }

  async appendAuditLog(input: AuditLogInput): Promise<PublicAuditLog> {
    const now = new Date();
    const row: DbAuditRow = {
      id: crypto.randomUUID(),
      actorId: normalizeOptional(input.actorId),
      applicationId: normalizeOptional(input.applicationId),
      action: requireText(input.action, 'action', 128),
      resource: requireText(input.resource, 'resource', 128),
      resourceId: normalizeOptional(input.resourceId),
      result: input.result,
      source: input.source,
      client: input.client
        ? JSON.stringify(sanitizeClient(input.client))
        : null,
      failureCode: normalizeOptional(input.failureCode),
      details: JSON.stringify(sanitizeDetails(input.details)),
      requestId: normalizeOptional(input.requestId),
      createdAt: now,
    };
    await this.connection.query
      .insertInto<DbAuditRow>('hubAuditLogs')
      .values(row)
      .execute();
    return this.toPublicAudit(row);
  }

  async listAuditLogs(
    options: AuditListOptions = {},
  ): Promise<ManagementPage<PublicAuditLog>> {
    await this.pruneExpiredAuditLogs();
    const pagination = normalizePagination(options);
    if (options.applicationIds?.length === 0) {
      return { items: [], total: 0, ...pagination };
    }
    const matchingActorIds = options.query
      ? await this.findMatchingUserIds(options.query)
      : [];
    const matchingApplicationIds = options.query
      ? await this.findMatchingApplicationIds(options.query)
      : [];
    let query = this.connection.query
      .selectFrom<DbAuditRow>('hubAuditLogs')
      .selectAll();
    if (options.applicationIds) {
      query = query.where('applicationId', 'in', options.applicationIds);
    }
    if (options.applicationId)
      query = query.where('applicationId', '=', options.applicationId);
    if (options.actorId) query = query.where('actorId', '=', options.actorId);
    if (options.action) {
      const actions =
        typeof options.action === 'string' ? [options.action] : options.action;
      query = query.where('action', 'in', actions);
    }
    if (options.resource)
      query = query.where('resource', '=', options.resource);
    if (options.resourceId)
      query = query.where('resourceId', '=', options.resourceId);
    if (options.result) query = query.where('result', '=', options.result);
    if (options.source) query = query.where('source', '=', options.source);
    if (options.from) query = query.where('createdAt', '>=', options.from);
    if (options.to) query = query.where('createdAt', '<=', options.to);
    if (options.query) {
      query = query.where((eb) =>
        eb.or([
          eb('action', 'like', `%${escapeLike(options.query ?? '')}%`),
          eb('resourceId', 'like', `%${escapeLike(options.query ?? '')}%`),
          ...(matchingActorIds.length > 0
            ? [eb('actorId', 'in', matchingActorIds)]
            : []),
          ...(matchingApplicationIds.length > 0
            ? [eb('applicationId', 'in', matchingApplicationIds)]
            : []),
        ]),
      );
    }
    const [rows, total] = await Promise.all([
      query
        .orderBy('createdAt', options.sort === 'createdAt' ? 'asc' : 'desc')
        .orderBy('id', options.sort === 'createdAt' ? 'asc' : 'desc')
        .limit(pagination.limit)
        .offset(pagination.offset)
        .execute<DbAuditRow>(),
      this.countAuditLogs(query),
    ]);
    const logs = await Promise.all(
      rows.map((row) => this.enrichAudit(this.toPublicAudit(row))),
    );
    return { items: logs, total, ...pagination };
  }

  async getAuditLog(id: string): Promise<PublicAuditLog | undefined> {
    await this.pruneExpiredAuditLogs();
    const row = await this.connection.query
      .selectFrom<DbAuditRow>('hubAuditLogs')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst<DbAuditRow>();
    return row ? this.enrichAudit(this.toPublicAudit(row)) : undefined;
  }

  async getAuditLogByRequestId(
    requestId: string,
  ): Promise<PublicAuditLog | undefined> {
    await this.pruneExpiredAuditLogs();
    const row = await this.connection.query
      .selectFrom<DbAuditRow>('hubAuditLogs')
      .selectAll()
      .where('requestId', '=', requestId)
      .executeTakeFirst<DbAuditRow>();
    return row ? this.enrichAudit(this.toPublicAudit(row)) : undefined;
  }

  async getSettings(): Promise<HubSettings> {
    const row = await this.connection.query
      .selectFrom<DbSettingsRow>('hubSettings')
      .selectAll()
      .where('key', '=', SETTINGS_KEY)
      .executeTakeFirst<DbSettingsRow>();
    if (!row) return withSettingsMeta(DEFAULT_SETTINGS, 1, null);
    return withSettingsMeta(
      mergeSettings(DEFAULT_SETTINGS, parseObject(row.value)),
      numberValue(row.revision, 1),
      dateString(row.updatedAt),
    );
  }

  private async pruneExpiredAuditLogs(now: Date = new Date()): Promise<void> {
    const settings = await this.getSettings();
    const cutoff = new Date(
      now.getTime() - settings.audit.retentionDays * 24 * 60 * 60 * 1_000,
    );
    await this.connection.query
      .deleteFrom('hubAuditLogs')
      .where('createdAt', '<', cutoff)
      .execute();
  }

  async patchSettings(
    patch: HubSettingsPatch,
    expectedRevision: number,
  ): Promise<HubSettings> {
    return this.connection.transaction(async (connection) => {
      const row = await connection.query
        .selectFrom<DbSettingsRow>('hubSettings')
        .selectAll()
        .where('key', '=', SETTINGS_KEY)
        .executeTakeFirst<DbSettingsRow>();
      const current = row
        ? withSettingsMeta(
            mergeSettings(DEFAULT_SETTINGS, parseObject(row.value)),
            numberValue(row.revision, 1),
            dateString(row.updatedAt),
          )
        : withSettingsMeta(DEFAULT_SETTINGS, 1, null);
      assertRevision(current.revision, expectedRevision);
      const next = mergeSettings(current, patch);
      const now = new Date();
      const value = JSON.stringify(stripSettingsMeta(next));
      if (row) {
        const result = await connection.query
          .updateTable<DbSettingsRow>('hubSettings')
          .set({ value, revision: expectedRevision + 1, updatedAt: now })
          .where('key', '=', SETTINGS_KEY)
          .where('revision', '=', expectedRevision)
          .execute();
        if (result.updatedCount !== 1) throw revisionMismatch();
      } else {
        await connection.query
          .insertInto<DbSettingsRow>('hubSettings')
          .values({ key: SETTINGS_KEY, value, revision: 2, updatedAt: now })
          .execute();
      }
      return withSettingsMeta(next, expectedRevision + 1, now.toISOString());
    });
  }

  async getStorageCleanupPlanData(
    now: Date = new Date(),
    options: { readonly limit?: number; readonly offset?: number } = {},
  ): Promise<StorageCleanupPlanData> {
    const pagination = normalizePagination(options);
    const settings = await this.getSettings();
    const applications = await this.connection.query
      .selectFrom<DbApplicationRow>('hubApplications')
      .select(['id', 'activeReleaseId'])
      .execute<{ id: string; activeReleaseId: string | null }>();
    const releases = await this.connection.query
      .selectFrom<DbReleaseRow>('hubReleases')
      .selectAll()
      .execute<DbReleaseRow>();
    const retentionRows = await this.connection.query
      .selectFrom('hubReleaseRetentions')
      .select(['releaseId', 'pinned'])
      .execute<{ releaseId: string; pinned: boolean | number }>();
    const runningDeployments = await this.connection.query
      .selectFrom('hubDeployments')
      .select(['targetReleaseId', 'previousReleaseId'])
      .where('status', 'not in', ['succeeded', 'failed', 'cancelled'])
      .execute<{
        targetReleaseId: string;
        previousReleaseId: string | null;
      }>();
    const pinned = new Set(
      retentionRows
        .filter((row) => Boolean(row.pinned))
        .map((row) => row.releaseId),
    );
    const active = new Set(
      applications
        .map((row) => row.activeReleaseId)
        .filter((id): id is string => Boolean(id)),
    );
    const deploymentProtected = new Set(
      runningDeployments.flatMap((deployment) => [
        deployment.targetReleaseId,
        ...(deployment.previousReleaseId ? [deployment.previousReleaseId] : []),
      ]),
    );
    const grouped = new Map<string, DbReleaseRow[]>();
    for (const release of releases)
      grouped.set(release.applicationId, [
        ...(grouped.get(release.applicationId) ?? []),
        release,
      ]);
    const candidates: StorageCleanupCandidate[] = [];
    const minimumAgeMs =
      settings.releaseRetention.minimumAgeDays * 24 * 60 * 60 * 1000;
    for (const rows of grouped.values()) {
      rows.sort((a, b) => dateValue(b.createdAt) - dateValue(a.createdAt));
      rows
        .slice(settings.releaseRetention.keepPerApplication)
        .forEach((release) => {
          if (
            active.has(release.id) ||
            pinned.has(release.id) ||
            deploymentProtected.has(release.id)
          )
            return;
          if (now.getTime() - dateValue(release.createdAt) < minimumAgeMs)
            return;
          candidates.push({
            id: release.id,
            applicationId: release.applicationId,
            version: release.version,
            sizeBytes: numberValue(release.sizeBytes, 0),
            createdAt: dateString(release.createdAt),
          });
        });
    }
    candidates.sort(
      (left, right) =>
        right.sizeBytes - left.sizeBytes || left.id.localeCompare(right.id),
    );
    return {
      automaticCleanupEnabled: false,
      total: candidates.length,
      ...pagination,
      totalReclaimableBytes: candidates.reduce(
        (total, candidate) => total + candidate.sizeBytes,
        0,
      ),
      protectedCounts: {
        activeRelease: active.size,
        deploymentReference: deploymentProtected.size,
        pinned: pinned.size,
      },
      measuredAt: now.toISOString(),
      releaseCandidates: candidates.slice(
        pagination.offset,
        pagination.offset + pagination.limit,
      ),
    };
  }

  private async setApplicationStatus(
    id: string,
    status: ApplicationManagementStatus,
    expectedRevision: number,
  ): Promise<ApplicationMutationResult> {
    return this.connection.transaction(async (connection) => {
      const current = await this.requireApplicationWithConnection(
        connection,
        id,
      );
      assertRevision(current.revision, expectedRevision);
      if (current.status === status)
        return { application: current, idempotent: true };
      const result = await connection.query
        .updateTable<DbApplicationRow>('hubApplications')
        .set({ status, revision: expectedRevision + 1, updatedAt: new Date() })
        .where('id', '=', id)
        .where('revision', '=', expectedRevision)
        .execute();
      if (result.updatedCount !== 1) throw revisionMismatch();
      return {
        application: await this.requireApplicationWithConnection(
          connection,
          id,
        ),
        idempotent: false,
      };
    });
  }

  private applyApplicationFilters(
    query: SelectQuery<DbApplicationRow, Row>,
    options: ApplicationListOptions,
  ): SelectQuery<DbApplicationRow, Row> {
    let next = query;
    if (options.applicationIds) {
      next = next.where('id', 'in', options.applicationIds);
    }
    if (options.query) {
      const pattern = `%${escapeLike(options.query)}%`;
      next = next.where((eb) =>
        eb.or([
          eb('name', 'like', pattern),
          eb('slug', 'like', pattern),
          eb('description', 'like', pattern),
        ]),
      );
    }
    if (options.statuses?.length)
      next = next.where('status', 'in', options.statuses);
    return next;
  }

  private async countApplications(
    options: ApplicationListOptions,
  ): Promise<number> {
    let query = this.connection.query
      .selectFrom<DbApplicationRow>('hubApplications')
      .select((eb) => [eb.fn.countAll().as('total')]);
    query = this.applyApplicationFilters(query, options);
    const row = await query.executeTakeFirst<{ total: number | string }>();
    return numberValue(row?.total, 0);
  }

  private async requireApplication(id: string): Promise<ManagedApplication> {
    const application = await this.getApplication(id);
    if (!application)
      throw notFound('APPLICATION_NOT_FOUND', 'Application was not found.');
    return application;
  }

  private async requireApplicationWithConnection(
    connection: DatabaseConnection,
    id: string,
  ): Promise<ManagedApplication> {
    const row = await connection.query
      .selectFrom<DbApplicationRow>('hubApplications')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst<DbApplicationRow>();
    if (!row)
      throw notFound('APPLICATION_NOT_FOUND', 'Application was not found.');
    return toApplication(row);
  }

  private async toPublicRelease(row: DbReleaseRow): Promise<PublicRelease> {
    const retention = await this.getRetention(row.id);
    return {
      id: row.id,
      applicationId: row.applicationId,
      version: row.version,
      checksum: row.checksum,
      manifest: parseObject(row.manifest),
      sizeBytes: row.sizeBytes === null ? null : numberValue(row.sizeBytes, 0),
      sourceCommit: row.sourceCommit,
      verificationStatus: row.verificationStatus,
      createdBy: row.createdBy,
      createdAt: dateString(row.createdAt),
      retention: {
        pinned: retention?.pinned ?? false,
        pinnedBy: retention?.pinnedBy ?? null,
        pinnedAt: retention?.pinnedAt ? dateString(retention.pinnedAt) : null,
      },
    };
  }

  private async requireRelease(
    applicationId: string,
    releaseId: string,
  ): Promise<PublicRelease> {
    const release = await this.getRelease(applicationId, releaseId);
    if (!release) throw notFound('RELEASE_NOT_FOUND', 'Release was not found.');
    return release;
  }

  private async getRetention(releaseId: string): Promise<
    | {
        pinned: boolean;
        pinnedBy: string | null;
        pinnedAt: Date | string | null;
      }
    | undefined
  > {
    const row = await this.connection.query
      .selectFrom('hubReleaseRetentions')
      .select(['pinned', 'pinnedBy', 'pinnedAt'])
      .where('releaseId', '=', releaseId)
      .executeTakeFirst<{
        pinned: boolean | number;
        pinnedBy: string | null;
        pinnedAt: Date | string | null;
      }>();
    return row
      ? {
          pinned: Boolean(row.pinned),
          pinnedBy: row.pinnedBy,
          pinnedAt: row.pinnedAt,
        }
      : undefined;
  }

  private async enrichMembers(
    rows: readonly DbMemberRow[],
    connection: DatabaseConnection = this.connection,
  ): Promise<ManagedMember[]> {
    const userIds = rows.map((row) => row.id);
    if (!userIds.length) return [];
    const assignments = await connection.query
      .selectFrom('hubRoleAssignments')
      .select(['userId', 'role', 'applicationId'])
      .where('userId', 'in', userIds)
      .where('disabled', '=', false)
      .execute<{
        userId: string;
        role: string;
        applicationId: string | null;
      }>();
    return rows.map((row) => {
      const own = assignments.filter(
        (assignment) => assignment.userId === row.id,
      );
      return {
        id: row.id,
        name: row.name,
        email: row.email,
        username: row.username,
        status: normalizeMemberStatus(row.status),
        roles: [...new Set(own.map((assignment) => assignment.role))],
        applicationIds: [
          ...new Set(
            own.flatMap((assignment) =>
              assignment.applicationId ? [assignment.applicationId] : [],
            ),
          ),
        ],
        lastActiveAt: row.lastActiveAt ? dateString(row.lastActiveAt) : null,
        createdAt: dateString(row.createdAt),
        revision: numberValue(row.memberRevision, 1),
      };
    });
  }

  private async requireMemberWithConnection(
    connection: DatabaseConnection,
    id: string,
  ): Promise<ManagedMember> {
    const member = await this.getMemberWithConnection(connection, id);
    if (!member) throw notFound('MEMBER_NOT_FOUND', 'Member was not found.');
    return member;
  }

  private async getMemberWithConnection(
    connection: DatabaseConnection,
    id: string,
  ): Promise<ManagedMember | undefined> {
    const rows = await connection.query
      .selectFrom<DbMemberRow>('user')
      .leftJoin('hubMemberStatuses', 'user.id', 'hubMemberStatuses.userId')
      .select([
        'user.id as id',
        'user.name as name',
        'user.email as email',
        'user.username as username',
        'user.createdAt as createdAt',
        'hubMemberStatuses.status as status',
        'hubMemberStatuses.lastActiveAt as lastActiveAt',
        'hubMemberStatuses.revision as memberRevision',
      ])
      .where('user.id', '=', id)
      .execute<DbMemberRow>();
    return (await this.enrichMembers(rows, connection))[0];
  }

  private async requireMemberStatus(
    connection: DatabaseConnection,
    id: string,
  ): Promise<{ status: MemberStatus; revision: number }> {
    await this.requireMemberWithConnection(connection, id);
    const row = await connection.query
      .selectFrom('hubMemberStatuses')
      .select(['status', 'revision'])
      .where('userId', '=', id)
      .executeTakeFirst<{ status: string; revision: number }>();
    if (!row)
      throw notFound('MEMBER_STATUS_NOT_FOUND', 'Member status was not found.');
    return {
      status: normalizeMemberStatus(row.status),
      revision: numberValue(row.revision, 1),
    };
  }

  private async isOnlyActiveOwner(
    connection: DatabaseConnection,
    userId: string,
  ): Promise<boolean> {
    const owners = await connection.query
      .selectFrom('hubRoleAssignments')
      .select('userId')
      .where('role', 'in', [...this.ownershipRoleIds])
      .where('applicationId', 'is', null)
      .where('disabled', '=', false)
      .execute<{ userId: string }>();
    const activeOwners = new Set<string>();
    for (const owner of owners) {
      const status = await connection.query
        .selectFrom('hubMemberStatuses')
        .select('status')
        .where('userId', '=', owner.userId)
        .executeTakeFirst<{ status: string }>();
      if (!status || status.status === 'active') activeOwners.add(owner.userId);
    }
    return activeOwners.size === 1 && activeOwners.has(userId);
  }

  private normalizeMemberAccess(input: MemberAccessInput): MemberAccessInput {
    const globalRoles = normalizeRoles(
      input.globalRoles,
      this.rolesById,
      'global',
    );
    const applications = input.applications.map((application) => ({
      applicationId: requireText(
        application.applicationId,
        'applicationId',
        64,
      ),
      roles: normalizeRoles(application.roles, this.rolesById, 'application'),
    }));
    return { globalRoles, applications };
  }

  private normalizeApplicationRoles(
    roles: readonly string[],
  ): readonly string[] {
    return normalizeRoles(roles, this.rolesById, 'application');
  }

  private async insertAccessAssignments(
    connection: DatabaseConnection,
    userId: string,
    access: MemberAccessInput,
  ): Promise<void> {
    const now = new Date();
    for (const role of access.globalRoles) {
      await connection.query
        .insertInto('hubRoleAssignments')
        .values({
          id: crypto.randomUUID(),
          userId,
          role,
          applicationId: null,
          disabled: false,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }
    for (const application of access.applications) {
      for (const role of application.roles) {
        await connection.query
          .insertInto('hubRoleAssignments')
          .values({
            id: crypto.randomUUID(),
            userId,
            role,
            applicationId: application.applicationId,
            disabled: false,
            createdAt: now,
            updatedAt: now,
          })
          .execute();
      }
    }
  }

  private async ensureAssignmentRevision(
    scopeType: 'member' | 'application',
    scopeId: string,
    connection: DatabaseConnection = this.connection,
  ): Promise<number> {
    const row = await connection.query
      .selectFrom('hubAssignmentRevisions')
      .select('revision')
      .where('scopeType', '=', scopeType)
      .where('scopeId', '=', scopeId)
      .executeTakeFirst<{ revision: number }>();
    if (row) return numberValue(row.revision, 1);
    await connection.query
      .insertInto('hubAssignmentRevisions')
      .values({ scopeType, scopeId, revision: 1, updatedAt: new Date() })
      .execute();
    return 1;
  }

  private async bumpAssignmentRevision(
    scopeType: 'member' | 'application',
    scopeId: string,
    expectedRevision: number,
    connection: DatabaseConnection = this.connection,
  ): Promise<number> {
    const result = await connection.query
      .updateTable('hubAssignmentRevisions')
      .set({ revision: expectedRevision + 1, updatedAt: new Date() })
      .where('scopeType', '=', scopeType)
      .where('scopeId', '=', scopeId)
      .where('revision', '=', expectedRevision)
      .execute();
    if (result.updatedCount !== 1) throw revisionMismatch();
    return expectedRevision + 1;
  }

  private async findMatchingUserIds(query: string): Promise<string[]> {
    const pattern = `%${escapeLike(query)}%`;
    const rows = await this.connection.query
      .selectFrom('user')
      .select('id')
      .where((eb) =>
        eb.or([
          eb('name', 'like', pattern),
          eb('email', 'like', pattern),
          eb('username', 'like', pattern),
        ]),
      )
      .execute<{ id: string }>();
    return rows.map((row) => row.id);
  }

  private async findMatchingApplicationIds(query: string): Promise<string[]> {
    const pattern = `%${escapeLike(query)}%`;
    const rows = await this.connection.query
      .selectFrom('hubApplications')
      .select('id')
      .where((eb) =>
        eb.or([
          eb('name', 'like', pattern),
          eb('slug', 'like', pattern),
          eb('description', 'like', pattern),
        ]),
      )
      .execute<{ id: string }>();
    return rows.map((row) => row.id);
  }

  private async countAuditLogs(
    query: ReturnType<DatabaseConnection['query']['selectFrom']>,
  ): Promise<number> {
    const countQuery = query
      .clearSelect()
      .clearOrderBy()
      .clearLimit()
      .clearOffset()
      .select((eb) => [eb.fn.countAll().as('total')]);
    const row = await countQuery.executeTakeFirst<{ total: number | string }>();
    return numberValue(row?.total, 0);
  }

  private toPublicAudit(row: DbAuditRow): PublicAuditLog {
    return {
      id: row.id,
      actorId: row.actorId,
      applicationId: row.applicationId,
      action: row.action,
      resource: row.resource,
      resourceId: row.resourceId,
      result: normalizeAuditResult(row.result),
      source: normalizeAuditSource(row.source),
      client: parseClient(row.client),
      failureCode: row.failureCode,
      details: sanitizeDetails(parseObject(row.details)),
      requestId: row.requestId,
      createdAt: dateString(row.createdAt),
    };
  }

  private async enrichAudit(log: PublicAuditLog): Promise<PublicAuditLog> {
    const [actor, application] = await Promise.all([
      log.actorId
        ? this.connection.query
            .selectFrom('user')
            .select(['id', 'name', 'email'])
            .where('id', '=', log.actorId)
            .executeTakeFirst<{ id: string; name: string; email: string }>()
        : Promise.resolve(undefined),
      log.applicationId
        ? this.connection.query
            .selectFrom('hubApplications')
            .select(['id', 'slug', 'name'])
            .where('id', '=', log.applicationId)
            .executeTakeFirst<{ id: string; slug: string; name: string }>()
        : Promise.resolve(undefined),
    ]);
    return { ...log, actor: actor ?? null, application: application ?? null };
  }

  private async countReleases(
    applicationId: string,
    options: ReleaseListOptions,
  ): Promise<number> {
    let query = this.connection.query
      .selectFrom<DbReleaseRow>('hubReleases')
      .select((eb) => [eb.fn.countAll().as('total')])
      .where('applicationId', '=', applicationId);
    if (options.query)
      query = query.where('version', 'like', `%${escapeLike(options.query)}%`);
    if (options.sourceCommit)
      query = query.where('sourceCommit', '=', options.sourceCommit);
    const row = await query.executeTakeFirst<{ total: number | string }>();
    return numberValue(row?.total, 0);
  }
}

function toApplication(row: DbApplicationRow): ManagedApplication {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    status: row.status === 'archived' ? 'archived' : 'active',
    desiredRuntimeState:
      row.desiredRuntimeState === 'running' ? 'running' : 'stopped',
    isDefault: Boolean(row.isDefault),
    revision: numberValue(row.revision, 1),
    defaultEnvironmentId: row.defaultEnvironmentId,
    activeReleaseId: row.activeReleaseId,
    createdBy: row.createdBy,
    createdAt: dateString(row.createdAt),
    updatedAt: dateString(row.updatedAt),
  };
}

function toRepository(row: DbRepositoryRow): RepositoryMetadata {
  return {
    id: row.id,
    applicationId: row.applicationId,
    provider: row.provider,
    defaultBranch: row.defaultBranch,
    headCommit: row.headCommit,
    status: row.status,
    initialCommit: row.initialCommit,
    createdAt: dateString(row.createdAt),
    updatedAt: dateString(row.updatedAt),
  };
}

function groupAccess(
  rows: readonly { role: string; applicationId: string | null }[],
  revision: number,
): MemberAccess {
  const globalRoles = rows
    .filter((row) => row.applicationId === null)
    .map((row) => row.role);
  const grouped = new Map<string, string[]>();
  for (const row of rows)
    if (row.applicationId)
      grouped.set(row.applicationId, [
        ...(grouped.get(row.applicationId) ?? []),
        row.role,
      ]);
  return {
    revision,
    globalRoles: [...new Set(globalRoles)],
    applications: [...grouped].map(([applicationId, roles]) => ({
      applicationId,
      roles: [...new Set(roles)],
    })),
  };
}

function applicationOrder(
  sort: ApplicationSort | undefined,
): [string, 'asc' | 'desc'] {
  const value = sort ?? '-createdAt';
  return value.startsWith('-') ? [value.slice(1), 'desc'] : [value, 'asc'];
}

function releaseOrder(
  sort: ReleaseListOptions['sort'] | undefined,
): [string, 'asc' | 'desc'] {
  const value = sort ?? '-createdAt';
  return value.startsWith('-') ? [value.slice(1), 'desc'] : [value, 'asc'];
}

function compareMembers(
  left: ManagedMember,
  right: ManagedMember,
  sort: MemberSort = '-createdAt',
): number {
  const descending = sort.startsWith('-');
  const field = descending ? sort.slice(1) : sort;
  let compared: number;
  if (field === 'name') {
    compared = left.name.localeCompare(right.name);
  } else if (field === 'lastActiveAt') {
    compared = compareNullableDates(left.lastActiveAt, right.lastActiveAt);
  } else {
    compared = dateValue(left.createdAt) - dateValue(right.createdAt);
  }
  if (compared === 0) compared = left.id.localeCompare(right.id);
  return descending ? -compared : compared;
}

function applicationAccessMatches(
  item: ApplicationAccessItem,
  options: ApplicationAccessListOptions,
): boolean {
  if (options.status && item.member.status !== options.status) return false;
  if (options.role && !item.roles.includes(options.role)) return false;
  const query = options.query?.trim().toLocaleLowerCase();
  if (!query) return true;
  return [item.member.name, item.member.email, item.member.username ?? ''].some(
    (value) => value.toLocaleLowerCase().includes(query),
  );
}

function compareApplicationAccess(
  left: ApplicationAccessItem,
  right: ApplicationAccessItem,
  sort: ApplicationAccessListOptions['sort'] = 'name',
): number {
  const descending = sort.startsWith('-');
  const field = descending ? sort.slice(1) : sort;
  let compared =
    field === 'createdAt'
      ? dateValue(left.member.createdAt) - dateValue(right.member.createdAt)
      : left.member.name.localeCompare(right.member.name);
  if (compared === 0) compared = left.member.id.localeCompare(right.member.id);
  return descending ? -compared : compared;
}

function compareNullableDates(
  left: string | null,
  right: string | null,
): number {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return dateValue(left) - dateValue(right);
}

function normalizePagination(options: { limit?: number; offset?: number }): {
  limit: number;
  offset: number;
} {
  return {
    limit: Math.min(
      MAX_LIMIT,
      Math.max(1, Math.trunc(options.limit ?? DEFAULT_LIMIT)),
    ),
    offset: Math.max(0, Math.trunc(options.offset ?? 0)),
  };
}

function assertRevision(current: number, expected: number): void {
  if (!Number.isInteger(expected) || current !== expected)
    throw revisionMismatch();
}

function revisionMismatch(): HubDomainError {
  return new HubDomainError(
    'REVISION_MISMATCH',
    'The resource revision is stale.',
    { status: 412 },
  );
}

function requireText(value: string, field: string, maxLength: number): string {
  const text = value.trim();
  if (!text || text.length > maxLength)
    throw new HubDomainError('VALIDATION_ERROR', `${field} is invalid.`, {
      status: 422,
    });
  return text;
}

function normalizeDescription(value: string | null): string | null {
  if (value === null) return null;
  return value.length > 10_000
    ? (() => {
        throw new HubDomainError(
          'VALIDATION_ERROR',
          'description is invalid.',
          { status: 422 },
        );
      })()
    : value;
}

function normalizeOptional(value: string | null | undefined): string | null {
  if (value === undefined || value === null || value === '') return null;
  return value;
}

function normalizeRoles(
  roles: readonly string[],
  definitions: ReadonlyMap<string, ManagementRoleDefinition>,
  scope: 'global' | 'application',
): readonly string[] {
  const unique = [...new Set(roles)];
  for (const roleId of unique) {
    const definition = definitions.get(roleId);
    if (!definition || !definition.scopes.includes(scope))
      throw new HubDomainError(
        'INVALID_ROLE',
        `Role "${roleId}" is not valid for this scope.`,
        { status: 422 },
      );
  }
  return unique;
}

function normalizeMemberStatus(value: string | null): MemberStatus {
  return value === 'disabled' ? 'disabled' : 'active';
}

function normalizeAuditResult(value: string): AuditResult {
  return value === 'failure' || value === 'denied' ? value : 'success';
}

function normalizeAuditSource(value: string): AuditSource {
  return value === 'agent' || value === 'git' || value === 'system'
    ? value
    : 'web';
}

function parseObject(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value))
    return value as Record<string, unknown>;
  if (typeof value !== 'string') return {};
  try {
    const parsed: unknown = JSON.parse(value);
    return typeof parsed === 'object' &&
      parsed !== null &&
      !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function parseClient(value: unknown): AuditClientSummary | null {
  const object = parseObject(value);
  if (!Object.keys(object).length) return null;
  return sanitizeClient({
    credentialId:
      typeof object.credentialId === 'string' ? object.credentialId : null,
    name: typeof object.name === 'string' ? object.name : null,
    ip: typeof object.ip === 'string' ? object.ip : null,
  });
}

function sanitizeClient(client: AuditClientSummary): AuditClientSummary {
  return {
    credentialId: client.credentialId ?? null,
    name: client.name ?? null,
    ip: client.ip ?? null,
  };
}

function sanitizeDetails(
  value: Record<string, unknown>,
): Record<string, unknown> {
  const blocked =
    /password|token|secret|authorization|cookie|ciphertext|nonce|storagekey/i;
  const sanitize = (entry: unknown): unknown => {
    if (Array.isArray(entry)) return entry.map(sanitize);
    if (typeof entry !== 'object' || entry === null) return entry;
    return Object.fromEntries(
      Object.entries(entry)
        .filter(([key]) => !blocked.test(key))
        .map(([key, child]) => [key, sanitize(child)]),
    );
  };
  return sanitize(value) as Record<string, unknown>;
}

function mergeSettings(
  base: HubSettings,
  patch: Partial<HubSettings> | HubSettingsPatch,
): HubSettings {
  const releasePatch = patch.releaseRetention ?? {};
  const auditPatch = patch.audit ?? {};
  const confirmationPatch = patch.confirmation ?? {};
  const keepPerApplication =
    releasePatch.keepPerApplication ?? base.releaseRetention.keepPerApplication;
  const minimumAgeDays =
    releasePatch.minimumAgeDays ?? base.releaseRetention.minimumAgeDays;
  if (
    !Number.isInteger(keepPerApplication) ||
    keepPerApplication < 1 ||
    keepPerApplication > 1000
  )
    throw new HubDomainError(
      'VALIDATION_ERROR',
      'keepPerApplication is invalid.',
      { status: 422 },
    );
  if (
    !Number.isInteger(minimumAgeDays) ||
    minimumAgeDays < 0 ||
    minimumAgeDays > 3650
  )
    throw new HubDomainError('VALIDATION_ERROR', 'minimumAgeDays is invalid.', {
      status: 422,
    });
  const retentionDays = auditPatch.retentionDays ?? base.audit.retentionDays;
  if (
    !Number.isInteger(retentionDays) ||
    retentionDays < 1 ||
    retentionDays > 3650
  )
    throw new HubDomainError('VALIDATION_ERROR', 'retentionDays is invalid.', {
      status: 422,
    });
  return {
    releaseRetention: {
      automaticCleanupEnabled: false,
      keepPerApplication,
      minimumAgeDays,
    },
    audit: {
      recordDeniedMutations:
        auditPatch.recordDeniedMutations ?? base.audit.recordDeniedMutations,
      retentionDays,
    },
    confirmation: {
      rollback: confirmationPatch.rollback ?? base.confirmation.rollback,
      archiveApplication:
        confirmationPatch.archiveApplication ??
        base.confirmation.archiveApplication,
      rotateRuntimeSecret:
        confirmationPatch.rotateRuntimeSecret ??
        base.confirmation.rotateRuntimeSecret,
    },
    revision: base.revision,
    updatedAt: base.updatedAt,
  };
}

function withSettingsMeta(
  settings: HubSettings,
  revision: number,
  updatedAt: string | null,
): HubSettings {
  return { ...settings, revision, updatedAt };
}

function stripSettingsMeta(
  settings: HubSettings,
): Omit<HubSettings, 'revision' | 'updatedAt'> {
  return {
    releaseRetention: settings.releaseRetention,
    audit: settings.audit,
    confirmation: settings.confirmation,
  };
}

function dateString(value: Date | string | null): string {
  if (value === null) return '';
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

function dateValue(value: Date | string): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

function numberValue(
  value: number | string | null | undefined,
  fallback: number,
): number {
  const result = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(result) ? result : fallback;
}

function escapeLike(value: string): string {
  return value.replaceAll(/[\\%_]/g, (character) => `\\${character}`);
}

function conflict(code: string, message: string): HubDomainError {
  return new HubDomainError(code, message, { status: 409 });
}

function notFound(code: string, message: string): HubDomainError {
  return new HubDomainError(code, message, { status: 404 });
}

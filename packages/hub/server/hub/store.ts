import type { DatabaseConnection, Row } from '@nocobase/app-database';

import type {
  HubApplication,
  HubDeployment,
  HubDeploymentEvent,
  HubErrorIssue,
  HubRelease,
  HubRole,
} from './types.ts';

const DEFAULT_ENVIRONMENT_ID = 'default';
const TERMINAL_DEPLOYMENT_STATUSES = [
  'succeeded',
  'failed',
  'cancelled',
] as const;

export interface HubListOptions {
  limit?: number;
  offset?: number;
  applicationIds?: readonly string[];
}

export interface DeploymentListOptions extends HubListOptions {
  applicationId?: string;
  statuses?: readonly HubDeployment['status'][];
  types?: readonly HubDeployment['type'][];
  requestedBy?: string;
  from?: Date;
  to?: Date;
  query?: string;
  sort?:
    | 'createdAt'
    | '-createdAt'
    | 'startedAt'
    | '-startedAt'
    | 'finishedAt'
    | '-finishedAt';
}

export interface HubListResult<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface CreateApplicationInput {
  slug: string;
  name: string;
  description?: string | null;
}

export interface CreateApplicationOptions {
  id?: string;
  isDefault?: boolean;
}

export interface CreateReleaseInput {
  version: string;
  checksum: string;
  manifest: Record<string, unknown>;
  storageKey?: string | null;
  sizeBytes?: number | null;
}

export interface CreateReleaseResult {
  release: HubRelease;
  created: boolean;
}

export interface CreateDeploymentInput {
  targetReleaseId: string;
  type?: 'deploy' | 'rollback' | 'redeploy';
  idempotencyKey?: string | null;
}

export interface CreateDeploymentResult {
  deployment: HubDeployment;
  created: boolean;
}

export interface AppendDeploymentEventInput {
  type: string;
  status: HubDeployment['status'];
  message?: string | null;
  hostId?: string | null;
  runtimeId?: string | null;
  details?: Record<string, unknown>;
}

export interface UpdateDeploymentInput {
  status: HubDeployment['status'];
  hostOperationId?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  failureCode?: string | null;
  failureMessage?: string | null;
}

interface CompleteDeploymentSuccessInput {
  hostOperationId: string | null;
  runtimeId?: string | null;
  recovered: boolean;
}

export interface ActiveApplicationRelease {
  application: HubApplication;
  release: HubRelease;
}

export interface HubRoleAssignment {
  id: string;
  userId: string;
  role: HubRole;
  applicationId: string | null;
  disabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface HubAppScope {
  id: string;
  userId: string;
  applicationId: string;
  actions: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateOwnerInput {
  userId: string;
  reservationToken: string;
  requestId?: string;
}

export class HubDomainError extends Error {
  readonly code: string;
  readonly status: number;
  readonly retryable: boolean;
  readonly issues?: HubErrorIssue[];

  constructor(
    code: string,
    message: string,
    options: {
      status?: number;
      retryable?: boolean;
      issues?: HubErrorIssue[];
      cause?: unknown;
    } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = 'HubDomainError';
    this.code = code;
    this.status = options.status ?? 400;
    this.retryable = options.retryable ?? false;
    this.issues = options.issues;
  }
}

export class HubStore {
  constructor(readonly connection: DatabaseConnection) {}

  async isSetupRequired(): Promise<boolean> {
    return !(await this.connection.query
      .selectFrom('hubRoleAssignments')
      .select('id')
      .where('role', '=', 'owner')
      .where('disabled', '=', false)
      .limit(1)
      .executeTakeFirst());
  }

  async reserveOwnerSetup(
    token: string,
    staleAfterMs: number = 5 * 60_000,
  ): Promise<void> {
    if (!(await this.isSetupRequired())) {
      throw conflict(
        'SETUP_ALREADY_COMPLETED',
        'Hub setup is already complete.',
      );
    }
    const now = new Date();
    const row = await this.connection.query
      .selectFrom('hubSettings')
      .selectAll()
      .where('key', '=', 'setup.owner.reservation')
      .executeTakeFirst();
    if (row) {
      const age = now.valueOf() - new Date(String(row.updatedAt)).valueOf();
      if (!Number.isFinite(age) || age < staleAfterMs) {
        throw conflict(
          'SETUP_IN_PROGRESS',
          'Hub owner setup is already in progress.',
        );
      }
      await this.connection.query
        .deleteFrom('hubSettings')
        .where('key', '=', 'setup.owner.reservation')
        .where('value', '=', row.value)
        .execute();
    }
    try {
      await this.connection.query
        .insertInto('hubSettings')
        .values({
          key: 'setup.owner.reservation',
          value: token,
          updatedAt: now,
        })
        .execute();
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw conflict(
          'SETUP_IN_PROGRESS',
          'Hub owner setup is already in progress.',
        );
      }
      throw error;
    }
  }

  async releaseOwnerSetupReservation(token: string): Promise<void> {
    await this.connection.query
      .deleteFrom('hubSettings')
      .where('key', '=', 'setup.owner.reservation')
      .where('value', '=', token)
      .execute();
  }

  async initializeOwner(input: CreateOwnerInput): Promise<void> {
    try {
      await this.connection.transaction(async (connection) => {
        const existing = await connection.query
          .selectFrom('hubRoleAssignments')
          .select('id')
          .where('role', '=', 'owner')
          .where('disabled', '=', false)
          .limit(1)
          .executeTakeFirst();
        if (existing) {
          throw conflict(
            'SETUP_ALREADY_COMPLETED',
            'Hub setup is already complete.',
          );
        }

        const reservation = await connection.query
          .selectFrom('hubSettings')
          .select('value')
          .where('key', '=', 'setup.owner.reservation')
          .executeTakeFirst();
        if (reservation?.value !== input.reservationToken) {
          throw conflict(
            'SETUP_RESERVATION_LOST',
            'Hub setup reservation is no longer valid.',
          );
        }

        const now = new Date();
        await connection.query
          .insertInto('hubRoleAssignments')
          .values({
            id: crypto.randomUUID(),
            userId: input.userId,
            role: 'owner',
            applicationId: null,
            disabled: false,
            createdAt: now,
            updatedAt: now,
          })
          .execute();
        await connection.query
          .insertInto('hubSettings')
          .values({
            key: 'setup.completed',
            value: input.userId,
            updatedAt: now,
          })
          .execute();
        await connection.query
          .deleteFrom('hubSettings')
          .where('key', '=', 'setup.owner.reservation')
          .where('value', '=', input.reservationToken)
          .execute();
        await connection.query
          .insertInto('hubAuditLogs')
          .values({
            id: crypto.randomUUID(),
            actorId: input.userId,
            action: 'setup.owner.created',
            resource: 'hub',
            resourceId: null,
            details: JSON.stringify({ role: 'owner' }),
            requestId: input.requestId ?? null,
            createdAt: now,
          })
          .execute();
      });
    } catch (error) {
      if (error instanceof HubDomainError) {
        throw error;
      }
      if (isUniqueConstraintError(error)) {
        throw conflict(
          'SETUP_ALREADY_COMPLETED',
          'Hub setup is already complete.',
        );
      }
      throw error;
    }
  }

  async assignRole(
    userId: string,
    role: HubRole,
    applicationId: string | null = null,
  ): Promise<HubRoleAssignment> {
    const now = new Date();
    const row = {
      id: crypto.randomUUID(),
      userId,
      role,
      applicationId,
      disabled: false,
      createdAt: now,
      updatedAt: now,
    };
    await this.connection.query
      .insertInto('hubRoleAssignments')
      .values(row)
      .execute();
    return toRoleAssignment(row);
  }

  async listRoleAssignments(userId: string): Promise<HubRoleAssignment[]> {
    const rows = await this.connection.query
      .selectFrom('hubRoleAssignments')
      .selectAll()
      .where('userId', '=', userId)
      .where('disabled', '=', false)
      .execute();
    return rows.map(toRoleAssignment);
  }

  async listAppScopes(userId: string): Promise<HubAppScope[]> {
    const rows = await this.connection.query
      .selectFrom('hubAppScopes')
      .selectAll()
      .where('userId', '=', userId)
      .execute();
    return rows.map(toAppScope);
  }

  async listApplications(
    options: HubListOptions = {},
  ): Promise<HubListResult<HubApplication>> {
    const pagination = normalizePagination(options);
    if (options.applicationIds?.length === 0) {
      return { items: [], total: 0, ...pagination };
    }
    const applicationIds = options.applicationIds;
    const [rows, total] = await Promise.all([
      (applicationIds
        ? this.connection.query
            .selectFrom('hubApplications')
            .selectAll()
            .where('id', 'in', applicationIds)
        : this.connection.query.selectFrom('hubApplications').selectAll()
      )
        .orderBy('createdAt', 'desc')
        .limit(pagination.limit)
        .offset(pagination.offset)
        .execute(),
      this.count(
        'hubApplications',
        applicationIds ? { id: applicationIds } : undefined,
      ),
    ]);
    return { items: rows.map(toApplication), total, ...pagination };
  }

  async getApplication(id: string): Promise<HubApplication | undefined> {
    const row = await this.connection.query
      .selectFrom('hubApplications')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    return row ? toApplication(row) : undefined;
  }

  async requireApplication(id: string): Promise<HubApplication> {
    const application = await this.getApplication(id);
    if (!application) {
      throw notFound(
        'APPLICATION_NOT_FOUND',
        `Application "${id}" was not found.`,
      );
    }
    return application;
  }

  async createApplication(
    input: CreateApplicationInput,
    actorId: string,
    options: CreateApplicationOptions = {},
  ): Promise<HubApplication> {
    const slug = normalizeSlug(input.slug);
    const name = requireText(input.name, 'name', 255);
    const now = new Date();
    const row = {
      id: options.id ?? crypto.randomUUID(),
      slug,
      name,
      description: normalizeOptionalText(input.description, 10_000),
      status: 'active',
      desiredRuntimeState: 'stopped',
      isDefault: options.isDefault ?? false,
      revision: 1,
      defaultEnvironmentId: DEFAULT_ENVIRONMENT_ID,
      activeReleaseId: null,
      createdBy: actorId,
      createdAt: now,
      updatedAt: now,
    };
    try {
      await this.connection.query
        .insertInto('hubApplications')
        .values(row)
        .execute();
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw conflict(
          'APPLICATION_SLUG_CONFLICT',
          `Application slug "${slug}" already exists.`,
        );
      }
      throw error;
    }
    return toApplication(row);
  }

  async listReleases(
    applicationId: string,
    options: HubListOptions = {},
  ): Promise<HubListResult<HubRelease>> {
    await this.requireApplication(applicationId);
    const pagination = normalizePagination(options);
    const [rows, total] = await Promise.all([
      this.connection.query
        .selectFrom('hubReleases')
        .selectAll()
        .where('applicationId', '=', applicationId)
        .orderBy('createdAt', 'desc')
        .limit(pagination.limit)
        .offset(pagination.offset)
        .execute(),
      this.count('hubReleases', { applicationId }),
    ]);
    return { items: rows.map(toRelease), total, ...pagination };
  }

  async getRelease(id: string): Promise<HubRelease | undefined> {
    const row = await this.connection.query
      .selectFrom('hubReleases')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    return row ? toRelease(row) : undefined;
  }

  async createRelease(
    applicationId: string,
    input: CreateReleaseInput,
    actorId: string,
  ): Promise<CreateReleaseResult> {
    await this.requireApplication(applicationId);
    const version = requireText(input.version, 'version', 128);
    if (!isSemVer(version)) {
      throw validation(
        'INVALID_RELEASE_VERSION',
        'Release version must be valid SemVer.',
      );
    }
    const checksum = requireText(input.checksum, 'checksum', 128);
    assertJsonObject(input.manifest, 'manifest');

    const existingRow = await this.connection.query
      .selectFrom('hubReleases')
      .selectAll()
      .where('applicationId', '=', applicationId)
      .where('version', '=', version)
      .executeTakeFirst();
    if (existingRow) {
      const existing = toRelease(existingRow);
      if (existing.checksum === checksum) {
        return { release: existing, created: false };
      }
      throw conflict(
        'VERSION_CONFLICT',
        `Release ${version} already exists with a different checksum.`,
      );
    }

    const row = {
      id: crypto.randomUUID(),
      applicationId,
      version,
      checksum,
      manifest: JSON.stringify(input.manifest),
      storageKey: normalizeOptionalText(input.storageKey, 1024),
      sizeBytes: normalizeSize(input.sizeBytes),
      verificationStatus: 'verified',
      createdBy: actorId,
      createdAt: new Date(),
    };
    try {
      await this.connection.query
        .insertInto('hubReleases')
        .values(row)
        .execute();
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        const raced = await this.connection.query
          .selectFrom('hubReleases')
          .selectAll()
          .where('applicationId', '=', applicationId)
          .where('version', '=', version)
          .executeTakeFirst();
        if (raced && String(raced.checksum) === checksum) {
          return { release: toRelease(raced), created: false };
        }
        throw conflict(
          'VERSION_CONFLICT',
          `Release ${version} already exists with a different checksum.`,
        );
      }
      throw error;
    }
    return { release: toRelease(row), created: true };
  }

  async listDeployments(
    options: DeploymentListOptions = {},
  ): Promise<HubListResult<HubDeployment>> {
    const pagination = normalizePagination(options);
    if (options.applicationIds?.length === 0) {
      return { items: [], total: 0, ...pagination };
    }
    let query = this.connection.query.selectFrom('hubDeployments').selectAll();
    if (options.applicationId) {
      query = query.where('applicationId', '=', options.applicationId);
    }
    if (options.applicationIds) {
      query = query.where('applicationId', 'in', options.applicationIds);
    }
    if (options.statuses?.length) {
      query = query.where('status', 'in', options.statuses);
    }
    if (options.types?.length) {
      query = query.where('type', 'in', options.types);
    }
    if (options.requestedBy) {
      query = query.where('requestedBy', '=', options.requestedBy);
    }
    if (options.from) query = query.where('createdAt', '>=', options.from);
    if (options.to) query = query.where('createdAt', '<=', options.to);
    if (options.query) {
      const pattern = `%${escapeLike(options.query)}%`;
      const [applications, releases] = await Promise.all([
        this.connection.query
          .selectFrom('hubApplications')
          .select('id')
          .where((eb) =>
            eb.or([eb('name', 'like', pattern), eb('slug', 'like', pattern)]),
          )
          .execute<{ id: string }>(),
        this.connection.query
          .selectFrom('hubReleases')
          .select('id')
          .where('version', 'like', pattern)
          .execute<{ id: string }>(),
      ]);
      query = query.where((eb) =>
        eb.or([
          eb('id', 'like', pattern),
          ...(applications.length
            ? [
                eb(
                  'applicationId',
                  'in',
                  applications.map((row) => row.id),
                ),
              ]
            : []),
          ...(releases.length
            ? [
                eb(
                  'targetReleaseId',
                  'in',
                  releases.map((row) => row.id),
                ),
              ]
            : []),
        ]),
      );
    }
    const sort = deploymentOrder(options.sort);
    const countQuery = query
      .clearSelect()
      .clearOrderBy()
      .clearLimit()
      .clearOffset()
      .select((eb) => [eb.fn.countAll().as('total')]);
    const [rows, total] = await Promise.all([
      query
        .orderBy(sort[0], sort[1])
        .orderBy('id', sort[1])
        .limit(pagination.limit)
        .offset(pagination.offset)
        .execute(),
      countQuery.executeTakeFirst<{ total: number | string }>(),
    ]);
    return {
      items: rows.map(toDeployment),
      total: Number(total?.total ?? 0),
      ...pagination,
    };
  }

  async getDeployment(id: string): Promise<HubDeployment | undefined> {
    const row = await this.connection.query
      .selectFrom('hubDeployments')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    return row ? toDeployment(row) : undefined;
  }

  async requireDeployment(id: string): Promise<HubDeployment> {
    const deployment = await this.getDeployment(id);
    if (!deployment) {
      throw notFound(
        'DEPLOYMENT_NOT_FOUND',
        `Deployment "${id}" was not found.`,
      );
    }
    return deployment;
  }

  async createDeployment(
    applicationId: string,
    input: CreateDeploymentInput,
    actorId: string,
  ): Promise<CreateDeploymentResult> {
    const idempotencyKey = normalizeOptionalText(input.idempotencyKey, 255);
    if (idempotencyKey) {
      const existing = await this.findDeploymentByIdempotency(
        applicationId,
        idempotencyKey,
      );
      if (existing) {
        if (
          existing.targetReleaseId !== input.targetReleaseId ||
          existing.type !== (input.type ?? 'deploy')
        ) {
          throw conflict(
            'IDEMPOTENCY_KEY_CONFLICT',
            'The idempotency key was already used with a different deployment request.',
          );
        }
        return { deployment: existing, created: false };
      }
    }

    const application = await this.requireApplication(applicationId);
    if (application.status === 'archived') {
      throw conflict(
        'APPLICATION_ARCHIVED',
        'Archived applications cannot be deployed.',
      );
    }
    const release = await this.getRelease(input.targetReleaseId);
    if (!release || release.applicationId !== applicationId) {
      throw notFound(
        'RELEASE_NOT_FOUND',
        `Release "${input.targetReleaseId}" was not found for this application.`,
      );
    }
    if (release.verificationStatus !== 'verified') {
      throw conflict(
        'RELEASE_NOT_VERIFIED',
        'Only verified releases can be deployed.',
      );
    }
    const type = input.type ?? 'deploy';
    if (type === 'redeploy') {
      if (!application.activeReleaseId) {
        throw conflict(
          'ACTIVE_RELEASE_REQUIRED',
          'Redeploy requires an active release.',
        );
      }
      if (release.id !== application.activeReleaseId) {
        throw conflict(
          'ACTIVE_RELEASE_CHANGED',
          'Redeploy must target the current active release.',
        );
      }
    }
    if (type === 'rollback') {
      const succeeded = await this.connection.query
        .selectFrom('hubDeployments')
        .select('id')
        .where('applicationId', '=', applicationId)
        .where('targetReleaseId', '=', release.id)
        .where('status', '=', 'succeeded')
        .limit(1)
        .executeTakeFirst();
      if (!succeeded) {
        throw validation(
          'VALIDATION_ERROR',
          'Rollback must target a previously successful release.',
        );
      }
    }

    try {
      return await this.connection.transaction(async (connection) => {
        const running = await connection.query
          .selectFrom('hubDeployments')
          .select('id')
          .where('applicationId', '=', applicationId)
          .where('environmentId', '=', DEFAULT_ENVIRONMENT_ID)
          .where('status', 'not in', TERMINAL_DEPLOYMENT_STATUSES)
          .limit(1)
          .executeTakeFirst();
        if (running) {
          throw conflict(
            'DEPLOYMENT_IN_PROGRESS',
            'Another deployment is already running for this application.',
          );
        }

        const now = new Date();
        const deploymentRow = {
          id: crypto.randomUUID(),
          applicationId,
          environmentId: DEFAULT_ENVIRONMENT_ID,
          targetReleaseId: release.id,
          previousReleaseId: application.activeReleaseId,
          type,
          status: 'queued',
          requestedBy: actorId,
          idempotencyKey,
          hostOperationId: null,
          startedAt: null,
          finishedAt: null,
          failureCode: null,
          failureMessage: null,
          createdAt: now,
        };
        await connection.query
          .insertInto('hubDeployments')
          .values(deploymentRow)
          .execute();
        await connection.query
          .insertInto('hubSettings')
          .values({
            key: deploymentReservationKey(applicationId),
            value: deploymentRow.id,
            updatedAt: now,
          })
          .execute();
        await connection.query
          .insertInto('hubDeploymentEvents')
          .values({
            id: crypto.randomUUID(),
            deploymentId: deploymentRow.id,
            sequence: 1,
            type: 'queued',
            status: 'queued',
            message: 'Deployment queued.',
            hostId: null,
            runtimeId: null,
            details: JSON.stringify({ targetReleaseId: release.id }),
            createdAt: now,
          })
          .execute();
        return { deployment: toDeployment(deploymentRow), created: true };
      });
    } catch (error) {
      if (error instanceof HubDomainError) {
        throw error;
      }
      if (idempotencyKey && isUniqueConstraintError(error)) {
        const existing = await this.findDeploymentByIdempotency(
          applicationId,
          idempotencyKey,
        );
        if (
          existing &&
          existing.targetReleaseId === input.targetReleaseId &&
          existing.type === (input.type ?? 'deploy')
        ) {
          return { deployment: existing, created: false };
        }
        if (existing) {
          throw conflict(
            'IDEMPOTENCY_KEY_CONFLICT',
            'The idempotency key is already in use.',
          );
        }
      }
      if (isUniqueConstraintError(error)) {
        throw conflict(
          'DEPLOYMENT_IN_PROGRESS',
          'Another deployment is already running for this application.',
        );
      }
      throw error;
    }
  }

  async listDeploymentEvents(
    deploymentId: string,
  ): Promise<HubDeploymentEvent[]> {
    await this.requireDeployment(deploymentId);
    const rows = await this.connection.query
      .selectFrom('hubDeploymentEvents')
      .selectAll()
      .where('deploymentId', '=', deploymentId)
      .orderBy('sequence', 'asc')
      .execute();
    return rows.map(toDeploymentEvent);
  }

  async appendDeploymentEvent(
    deploymentId: string,
    input: AppendDeploymentEventInput,
  ): Promise<HubDeploymentEvent> {
    return this.connection.transaction(async (connection) => {
      const last = await connection.query
        .selectFrom('hubDeploymentEvents')
        .select('sequence')
        .where('deploymentId', '=', deploymentId)
        .orderBy('sequence', 'desc')
        .limit(1)
        .executeTakeFirst();
      const row = {
        id: crypto.randomUUID(),
        deploymentId,
        sequence: Number(last?.sequence ?? 0) + 1,
        type: requireText(input.type, 'type', 64),
        status: input.status,
        message: normalizeOptionalText(input.message, 10_000),
        hostId: normalizeOptionalText(input.hostId, 128),
        runtimeId: normalizeOptionalText(input.runtimeId, 128),
        details: JSON.stringify(input.details ?? {}),
        createdAt: new Date(),
      };
      await connection.query
        .insertInto('hubDeploymentEvents')
        .values(row)
        .execute();
      return toDeploymentEvent(row);
    });
  }

  async completeDeploymentSuccess(
    id: string,
    input: CompleteDeploymentSuccessInput,
  ): Promise<HubDeployment> {
    return this.connection.transaction(async (connection) => {
      const currentRow = await connection.query
        .selectFrom('hubDeployments')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst();
      if (!currentRow) {
        throw notFound(
          'DEPLOYMENT_NOT_FOUND',
          `Deployment "${id}" was not found.`,
        );
      }
      const current = toDeployment(currentRow);
      if (current.status === 'succeeded') return current;
      if (isTerminalDeploymentStatus(current.status)) {
        throw conflict(
          'DEPLOYMENT_ALREADY_TERMINAL',
          'The deployment has already reached a terminal state.',
        );
      }

      const reservation = await connection.query
        .selectFrom('hubSettings')
        .select('value')
        .where('key', '=', deploymentReservationKey(current.applicationId))
        .executeTakeFirst();
      if (reservation?.value !== id) {
        throw conflict(
          'DEPLOYMENT_RESERVATION_LOST',
          'The deployment no longer owns the application reservation.',
        );
      }

      const application = await connection.query
        .selectFrom('hubApplications')
        .select(['id', 'activeReleaseId'])
        .where('id', '=', current.applicationId)
        .executeTakeFirst();
      if (!application) {
        throw notFound(
          'APPLICATION_NOT_FOUND',
          `Application "${current.applicationId}" was not found.`,
        );
      }
      const activeReleaseId = nullableString(application.activeReleaseId);
      const recoveredAlreadyActive =
        input.recovered && activeReleaseId === current.targetReleaseId;

      if (!recoveredAlreadyActive) {
        let applicationUpdate = connection.query
          .updateTable('hubApplications')
          .set({
            activeReleaseId: current.targetReleaseId,
            desiredRuntimeState: 'running',
            updatedAt: new Date(),
          })
          .where('id', '=', current.applicationId);
        applicationUpdate = current.previousReleaseId
          ? applicationUpdate.where(
              'activeReleaseId',
              '=',
              current.previousReleaseId,
            )
          : applicationUpdate.where('activeReleaseId', 'is', null);
        const activeReleaseResult = await applicationUpdate.execute();
        if (activeReleaseResult.updatedCount !== 1) {
          throw conflict(
            'DEPLOYMENT_SUPERSEDED',
            "The application's active release changed while the deployment was running.",
          );
        }
      }

      if (recoveredAlreadyActive) {
        await connection.query
          .updateTable('hubApplications')
          .set({ desiredRuntimeState: 'running', updatedAt: new Date() })
          .where('id', '=', current.applicationId)
          .execute();
      }

      const finishedAt = new Date();
      const deploymentResult = await connection.query
        .updateTable('hubDeployments')
        .set({
          status: 'succeeded',
          finishedAt,
          hostOperationId: input.hostOperationId,
          failureCode: null,
          failureMessage: null,
        })
        .where('id', '=', id)
        .where('status', 'not in', TERMINAL_DEPLOYMENT_STATUSES)
        .execute();
      if (deploymentResult.updatedCount !== 1) {
        throw conflict(
          'DEPLOYMENT_ALREADY_TERMINAL',
          'The deployment has already reached a terminal state.',
        );
      }

      const lastEvent = await connection.query
        .selectFrom('hubDeploymentEvents')
        .select('sequence')
        .where('deploymentId', '=', id)
        .orderBy('sequence', 'desc')
        .limit(1)
        .executeTakeFirst();
      await connection.query
        .insertInto('hubDeploymentEvents')
        .values({
          id: crypto.randomUUID(),
          deploymentId: id,
          sequence: Number(lastEvent?.sequence ?? 0) + 1,
          type: 'succeeded',
          status: 'succeeded',
          message: input.recovered
            ? 'Deployment outcome recovered.'
            : 'Deployment completed.',
          hostId: null,
          runtimeId: normalizeOptionalText(input.runtimeId, 128),
          details: JSON.stringify({
            activeReleaseId: current.targetReleaseId,
            ...(input.recovered ? { recovered: true } : {}),
          }),
          createdAt: finishedAt,
        })
        .execute();
      await connection.query
        .deleteFrom('hubSettings')
        .where('key', '=', deploymentReservationKey(current.applicationId))
        .where('value', '=', id)
        .execute();

      return {
        ...current,
        status: 'succeeded',
        finishedAt: finishedAt.toISOString(),
        hostOperationId: input.hostOperationId,
        failureCode: null,
        failureMessage: null,
      };
    });
  }

  async updateDeployment(
    id: string,
    input: UpdateDeploymentInput,
  ): Promise<HubDeployment> {
    return this.connection.transaction(async (connection) => {
      const currentRow = await connection.query
        .selectFrom('hubDeployments')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst();
      if (!currentRow) {
        throw notFound(
          'DEPLOYMENT_NOT_FOUND',
          `Deployment "${id}" was not found.`,
        );
      }
      const current = toDeployment(currentRow);
      if (isTerminalDeploymentStatus(current.status)) {
        if (current.status === input.status) return current;
        throw conflict(
          'DEPLOYMENT_ALREADY_TERMINAL',
          'The deployment has already reached a terminal state.',
        );
      }
      if (input.status === 'succeeded') {
        throw new HubDomainError(
          'DEPLOYMENT_SUCCESS_REQUIRES_ATOMIC_COMMIT',
          'Successful deployments must be committed atomically.',
          { status: 500 },
        );
      }
      const update = {
        status: input.status,
        hostOperationId:
          input.hostOperationId === undefined
            ? current.hostOperationId
            : input.hostOperationId,
        startedAt:
          input.startedAt === undefined
            ? toDatabaseDate(current.startedAt)
            : toDatabaseDate(input.startedAt),
        finishedAt:
          input.finishedAt === undefined
            ? toDatabaseDate(current.finishedAt)
            : toDatabaseDate(input.finishedAt),
        failureCode:
          input.failureCode === undefined
            ? current.failureCode
            : input.failureCode,
        failureMessage:
          input.failureMessage === undefined
            ? current.failureMessage
            : input.failureMessage,
      };
      const result = await connection.query
        .updateTable('hubDeployments')
        .set(update)
        .where('id', '=', id)
        .where('status', '=', current.status)
        .execute();
      if (result.updatedCount !== 1) {
        throw conflict(
          'DEPLOYMENT_STATE_CHANGED',
          'The deployment state changed concurrently.',
        );
      }
      if (isTerminalDeploymentStatus(input.status)) {
        await connection.query
          .deleteFrom('hubSettings')
          .where('key', '=', deploymentReservationKey(current.applicationId))
          .where('value', '=', id)
          .execute();
      }
      return { ...current, ...input };
    });
  }

  async setActiveRelease(
    applicationId: string,
    releaseId: string,
  ): Promise<void> {
    await this.connection.query
      .updateTable('hubApplications')
      .set({
        activeReleaseId: releaseId,
        desiredRuntimeState: 'running',
        updatedAt: new Date(),
      })
      .where('id', '=', applicationId)
      .execute();
  }

  async listUnfinishedDeployments(): Promise<HubDeployment[]> {
    const rows = await this.connection.query
      .selectFrom('hubDeployments')
      .selectAll()
      .where('status', 'not in', TERMINAL_DEPLOYMENT_STATUSES)
      .orderBy('createdAt', 'asc')
      .execute();
    return rows.map(toDeployment);
  }

  async listActiveApplicationReleases(): Promise<ActiveApplicationRelease[]> {
    const rows = await this.connection.query
      .selectFrom('hubApplications')
      .selectAll()
      .where('activeReleaseId', 'is not', null)
      .where('status', '=', 'active')
      .execute();
    const result: ActiveApplicationRelease[] = [];
    for (const row of rows) {
      const application = toApplication(row);
      if (!application.activeReleaseId) continue;
      const release = await this.getRelease(application.activeReleaseId);
      if (!release) {
        throw new HubDomainError(
          'ACTIVE_RELEASE_NOT_FOUND',
          `Active release "${application.activeReleaseId}" for application "${application.id}" was not found.`,
          { status: 500 },
        );
      }
      result.push({ application, release });
    }
    return result;
  }

  private async findDeploymentByIdempotency(
    applicationId: string,
    idempotencyKey: string,
  ): Promise<HubDeployment | undefined> {
    const row = await this.connection.query
      .selectFrom('hubDeployments')
      .selectAll()
      .where('applicationId', '=', applicationId)
      .where('idempotencyKey', '=', idempotencyKey)
      .executeTakeFirst();
    return row ? toDeployment(row) : undefined;
  }

  private async count(
    table: string,
    where?: Record<string, unknown>,
  ): Promise<number> {
    let query = this.connection.query
      .selectFrom(table)
      .select((eb) => [eb.fn.countAll().as('total')]);
    for (const [key, value] of Object.entries(where ?? {})) {
      query = Array.isArray(value)
        ? query.where(key, 'in', value)
        : query.where(key, '=', value);
    }
    const row = await query.executeTakeFirst();
    return Number(row?.total ?? 0);
  }
}

function normalizePagination(options: HubListOptions): {
  limit: number;
  offset: number;
} {
  const limit = Math.min(100, Math.max(1, Math.trunc(options.limit ?? 20)));
  const offset = Math.max(0, Math.trunc(options.offset ?? 0));
  return { limit, offset };
}

function deploymentOrder(
  sort: DeploymentListOptions['sort'],
): [string, 'asc' | 'desc'] {
  const value = sort ?? '-createdAt';
  return value.startsWith('-') ? [value.slice(1), 'desc'] : [value, 'asc'];
}

function escapeLike(value: string): string {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll('%', '\\%')
    .replaceAll('_', '\\_');
}

function deploymentReservationKey(applicationId: string): string {
  return `deployment.running.${applicationId}.${DEFAULT_ENVIRONMENT_ID}`;
}

function isTerminalDeploymentStatus(status: HubDeployment['status']): boolean {
  return (TERMINAL_DEPLOYMENT_STATUSES as readonly string[]).includes(status);
}

function normalizeSlug(value: string): string {
  const slug = requireText(value, 'slug', 128).toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(slug)) {
    throw validation(
      'INVALID_APPLICATION_SLUG',
      'Application slug must contain lowercase letters, numbers, and single hyphens.',
    );
  }
  return slug;
}

function requireText(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw validation('VALIDATION_ERROR', `${field} is required.`);
  }
  const text = value.trim();
  if (text.length > maxLength) {
    throw validation(
      'VALIDATION_ERROR',
      `${field} must not exceed ${maxLength} characters.`,
    );
  }
  return text;
}

function normalizeOptionalText(
  value: unknown,
  maxLength: number,
): string | null {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  if (typeof value !== 'string') {
    throw validation('VALIDATION_ERROR', 'Expected a string value.');
  }
  const text = value.trim();
  if (text.length > maxLength) {
    throw validation(
      'VALIDATION_ERROR',
      `Value must not exceed ${maxLength} characters.`,
    );
  }
  return text || null;
}

function normalizeSize(value: unknown): number | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw validation(
      'VALIDATION_ERROR',
      'sizeBytes must be a non-negative integer.',
    );
  }
  return value;
}

function isSemVer(value: string): boolean {
  const match =
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.exec(
      value,
    );
  if (!match) return false;
  const prerelease = match[4];
  return !prerelease
    ?.split('.')
    .some(
      (identifier) =>
        /^\d+$/.test(identifier) &&
        identifier.length > 1 &&
        identifier.startsWith('0'),
    );
}

function assertJsonObject(
  value: unknown,
  field: string,
): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw validation('VALIDATION_ERROR', `${field} must be a JSON object.`);
  }
  try {
    JSON.stringify(value);
  } catch {
    throw validation('VALIDATION_ERROR', `${field} must be serializable JSON.`);
  }
}

function toApplication(row: Row): HubApplication {
  return {
    id: String(row.id),
    slug: String(row.slug),
    name: String(row.name),
    description: nullableString(row.description),
    status: row.status as HubApplication['status'],
    desiredRuntimeState:
      row.desiredRuntimeState === 'running' ? 'running' : 'stopped',
    defaultEnvironmentId: String(row.defaultEnvironmentId),
    activeReleaseId: nullableString(row.activeReleaseId),
    createdBy: String(row.createdBy),
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt),
  };
}

function toRelease(row: Row): HubRelease {
  return {
    id: String(row.id),
    applicationId: String(row.applicationId),
    version: String(row.version),
    checksum: String(row.checksum),
    manifest: parseJsonObject(row.manifest),
    storageKey: nullableString(row.storageKey),
    sizeBytes:
      row.sizeBytes === null || row.sizeBytes === undefined
        ? null
        : Number(row.sizeBytes),
    verificationStatus:
      row.verificationStatus as HubRelease['verificationStatus'],
    createdBy: String(row.createdBy),
    createdAt: toIsoString(row.createdAt),
  };
}

function toDeployment(row: Row): HubDeployment {
  return {
    id: String(row.id),
    applicationId: String(row.applicationId),
    environmentId: String(row.environmentId),
    targetReleaseId: String(row.targetReleaseId),
    previousReleaseId: nullableString(row.previousReleaseId),
    type: row.type as HubDeployment['type'],
    status: row.status as HubDeployment['status'],
    requestedBy: String(row.requestedBy),
    idempotencyKey: nullableString(row.idempotencyKey),
    hostOperationId: nullableString(row.hostOperationId),
    startedAt: nullableIsoString(row.startedAt),
    finishedAt: nullableIsoString(row.finishedAt),
    failureCode: nullableString(row.failureCode),
    failureMessage: nullableString(row.failureMessage),
    createdAt: toIsoString(row.createdAt),
  };
}

function toDeploymentEvent(row: Row): HubDeploymentEvent {
  return {
    id: String(row.id),
    deploymentId: String(row.deploymentId),
    sequence: Number(row.sequence),
    type: String(row.type),
    status: row.status as HubDeploymentEvent['status'],
    message: nullableString(row.message),
    hostId: nullableString(row.hostId),
    runtimeId: nullableString(row.runtimeId),
    details: parseJsonObject(row.details),
    createdAt: toIsoString(row.createdAt),
  };
}

function toRoleAssignment(row: Row): HubRoleAssignment {
  return {
    id: String(row.id),
    userId: String(row.userId),
    role: row.role as HubRole,
    applicationId: nullableString(row.applicationId),
    disabled: Boolean(row.disabled),
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt),
  };
}

function toAppScope(row: Row): HubAppScope {
  const actions = parseJson(row.actions);
  return {
    id: String(row.id),
    userId: String(row.userId),
    applicationId: String(row.applicationId),
    actions: Array.isArray(actions) ? actions.map(String) : [],
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt),
  };
}

function parseJsonObject(value: unknown): Record<string, unknown> {
  const parsed = parseJson(value);
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : {};
}

function parseJson(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function nullableString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return String(value);
  }
  return null;
}

function nullableIsoString(value: unknown): string | null {
  return value === null || value === undefined ? null : toIsoString(value);
}

function toIsoString(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const numericDate = new Date(value);
    if (!Number.isNaN(numericDate.valueOf())) return numericDate.toISOString();
  }
  const date = new Date(String(value));
  return Number.isNaN(date.valueOf()) ? String(value) : date.toISOString();
}

function toDatabaseDate(value: string | null | undefined): Date | null {
  return value ? new Date(value) : null;
}

function validation(code: string, message: string): HubDomainError {
  return new HubDomainError(code, message, { status: 422 });
}

function conflict(code: string, message: string): HubDomainError {
  return new HubDomainError(code, message, { status: 409 });
}

function notFound(code: string, message: string): HubDomainError {
  return new HubDomainError(code, message, { status: 404 });
}

function isUniqueConstraintError(error: unknown): boolean {
  const value = error as { code?: unknown; message?: unknown };
  return (
    value?.code === 'SQLITE_CONSTRAINT' ||
    value?.code === 'SQLITE_CONSTRAINT_UNIQUE' ||
    (typeof value?.message === 'string' &&
      value.message.includes('UNIQUE constraint failed'))
  );
}

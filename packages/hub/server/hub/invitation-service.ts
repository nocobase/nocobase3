import type { DatabaseConnection, Row } from '@nocobase/app-database';
import {
  PasswordUserCreationError,
  type Auth,
} from '@nocobase/app-plugin-authentication';
import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { HubDomainError } from './store.ts';

const TOKEN_PREFIX = 'nbi_';
const TOKEN_BYTES = 32;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const MIN_EXPIRY_DAYS = 1;
const MAX_EXPIRY_DAYS = 30;

export type InvitationStatus = 'pending' | 'accepted' | 'expired' | 'revoked';

export type InvitationSort =
  'createdAt' | '-createdAt' | 'expiresAt' | '-expiresAt';

export interface InvitationRoleDefinition {
  readonly id: string;
  readonly name: string;
  readonly scopes: readonly ('global' | 'application')[];
}

export interface InvitationApplicationAccessInput {
  readonly applicationId: string;
  readonly roles: readonly string[];
}

export interface InvitationAccessInput {
  readonly globalRoles: readonly string[];
  readonly applications: readonly InvitationApplicationAccessInput[];
}

export interface CreateInvitationInput {
  readonly email: string;
  readonly expiresInDays: number;
  readonly access: InvitationAccessInput;
}

export interface CreateInvitationOptions {
  readonly acceptanceUrl?: string;
}

export interface InvitationApplicationAccess {
  readonly applicationId: string;
  readonly roles: readonly string[];
}

export interface InvitationAccess {
  readonly globalRoles: readonly string[];
  readonly applications: readonly InvitationApplicationAccess[];
}

export interface ManagedInvitation {
  readonly id: string;
  readonly email: string;
  readonly access: InvitationAccess;
  readonly status: InvitationStatus;
  readonly invitedBy: string;
  readonly expiresAt: string;
  readonly acceptedBy: string | null;
  readonly acceptedAt: string | null;
  readonly revokedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CreatedInvitation extends ManagedInvitation {
  /** The only response in which the opaque token is returned. */
  readonly inviteUrl: string;
}

export interface InvitationListOptions {
  readonly query?: string;
  readonly status?: InvitationStatus;
  readonly sort?: InvitationSort;
  readonly limit?: number;
  readonly offset?: number;
}

export interface InvitationPage {
  readonly items: readonly ManagedInvitation[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

export interface InvitationMutationResult {
  readonly invitation: ManagedInvitation;
  readonly idempotent: boolean;
}

export interface ResolvedInvitationRole {
  readonly id: string;
  readonly name: string;
}

export interface ResolvedInvitationApplication {
  readonly name: string;
  readonly roles: readonly ResolvedInvitationRole[];
}

export interface ResolvedInvitation {
  readonly email: string;
  readonly hubDisplayName: string;
  readonly access: {
    readonly globalRoles: readonly ResolvedInvitationRole[];
    readonly applications: readonly ResolvedInvitationApplication[];
  };
  readonly expiresAt: string;
}

export interface AcceptInvitationInput {
  readonly token: string;
  readonly name: string;
  readonly username: string;
  readonly password: string;
}

export interface AcceptedInvitationMember {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly username: string | null;
  readonly status: 'active';
  readonly roles: readonly string[];
  readonly applicationIds: readonly string[];
  readonly lastActiveAt: null;
  readonly createdAt: string;
  readonly revision: 1;
}

export interface AcceptedInvitation {
  readonly member: AcceptedInvitationMember;
  readonly access: InvitationAccess;
}

export interface HubInvitationServiceOptions {
  readonly acceptanceUrl?: string;
  readonly hubDisplayName: string;
  readonly roles: readonly InvitationRoleDefinition[];
  readonly auth: Pick<Auth, 'createPasswordUser'>;
  readonly clock?: () => Date;
}

interface NormalizedHubInvitationServiceOptions {
  readonly acceptanceUrl: string | undefined;
  readonly hubDisplayName: string;
  readonly roles: ReadonlyMap<string, InvitationRoleDefinition>;
  readonly auth: Pick<Auth, 'createPasswordUser'>;
  readonly clock: () => Date;
}

interface InvitationRow extends Row {
  id: string;
  tokenHash: string;
  email: string;
  access: unknown;
  status: string;
  invitedBy: string;
  expiresAt: Date | string | number;
  acceptedBy: string | null;
  acceptedAt: Date | string | number | null;
  revokedAt: Date | string | number | null;
  createdAt: Date | string | number;
  updatedAt: Date | string | number;
}

interface UserEmailRow extends Row {
  id: string;
  email: string;
}

interface ApplicationNameRow extends Row {
  id: string;
  name: string;
}

interface MemberIdentityRow extends Row {
  id: string;
  email: string;
  username: string | null;
}

/**
 * Owns the persistence and public-safe projection of Hub invitations.
 *
 * Accepting an invitation creates the authentication account and all Hub
 * assignments through the same caller-owned database transaction.
 */
export class HubInvitationService {
  private readonly options: NormalizedHubInvitationServiceOptions;
  private readonly emailTails = new Map<string, Promise<void>>();
  private readonly tokenTails = new Map<string, Promise<void>>();

  constructor(
    private readonly connection: DatabaseConnection,
    options: HubInvitationServiceOptions,
  ) {
    const acceptanceUrl = options.acceptanceUrl
      ? normalizeAcceptanceUrl(options.acceptanceUrl)
      : undefined;
    const hubDisplayName = requiredText(
      options.hubDisplayName,
      'hubDisplayName',
      255,
    );
    const roles = new Map<string, InvitationRoleDefinition>();
    for (const role of options.roles) {
      const id = requiredText(role.id, 'role.id', 64);
      const name = requiredText(role.name, 'role.name', 255);
      if (roles.has(id)) {
        throw new HubDomainError(
          'INVITATION_ROLE_CONFIGURATION_INVALID',
          `Duplicate invitation role: ${id}.`,
          { status: 500 },
        );
      }
      roles.set(id, {
        id,
        name,
        scopes: [...new Set(role.scopes)],
      });
    }
    this.options = {
      acceptanceUrl,
      hubDisplayName,
      roles,
      auth: options.auth,
      clock: options.clock ?? (() => new Date()),
    };
  }

  async createInvitation(
    input: CreateInvitationInput,
    invitedBy: string,
    options: CreateInvitationOptions = {},
  ): Promise<CreatedInvitation> {
    const email = normalizeEmail(input.email);
    const expiresInDays = normalizeExpiryDays(input.expiresInDays);
    const access = await this.normalizeAccess(input.access);
    const actorId = requiredText(invitedBy, 'invitedBy', 64);
    const acceptanceUrl = resolveAcceptanceUrl(
      options.acceptanceUrl ?? this.options.acceptanceUrl,
    );
    return this.withEmailLock(email, async () => {
      await this.expirePendingInvitations(email);
      const [existingMember, existingInvitation] = await Promise.all([
        this.findUserByEmail(email),
        this.connection.query
          .selectFrom<InvitationRow>('hubInvitations')
          .select(['id', 'status', 'expiresAt'])
          .where('email', '=', email)
          .where('status', '=', 'pending')
          .executeTakeFirst<
            Pick<InvitationRow, 'id' | 'status' | 'expiresAt'>
          >(),
      ]);
      if (existingMember || existingInvitation) {
        throw new HubDomainError(
          'INVITATION_ALREADY_EXISTS',
          'An active member or invitation already exists for this email.',
          { status: 409 },
        );
      }

      const now = this.now();
      const expiresAt = new Date(
        now.valueOf() + expiresInDays * 24 * 60 * 60 * 1_000,
      );
      const token = createInvitationToken();
      const row = {
        id: randomUUID(),
        tokenHash: hashInvitationToken(token),
        email,
        access: JSON.stringify(access),
        status: 'pending' as const,
        invitedBy: actorId,
        expiresAt,
        acceptedBy: null,
        acceptedAt: null,
        revokedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      try {
        await this.connection.query
          .insertInto('hubInvitations')
          .values(row)
          .execute();
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          throw new HubDomainError(
            'INVITATION_ALREADY_EXISTS',
            'An active member or invitation already exists for this email.',
            { status: 409, cause: error },
          );
        }
        throw error;
      }
      const invitation = toManagedInvitation({ ...row });
      return {
        ...invitation,
        inviteUrl: buildInviteUrl(acceptanceUrl, token),
      };
    });
  }

  async listInvitations(
    options: InvitationListOptions = {},
  ): Promise<InvitationPage> {
    await this.expireAllPendingInvitations();
    const pagination = normalizePagination(options);
    const query = normalizeQuery(options.query);
    const sort = invitationOrder(options.sort);
    let rowsQuery = this.connection.query
      .selectFrom<InvitationRow>('hubInvitations')
      .selectAll();
    let countQuery = this.connection.query
      .selectFrom<InvitationRow>('hubInvitations')
      .select((expression) => [expression.fn.countAll().as('total')]);
    if (options.status) {
      rowsQuery = rowsQuery.where('status', '=', options.status);
      countQuery = countQuery.where('status', '=', options.status);
    }
    if (query) {
      const pattern = `%${escapeLike(query)}%`;
      rowsQuery = rowsQuery.where('email', 'like', pattern);
      countQuery = countQuery.where('email', 'like', pattern);
    }
    const [rows, totalRow] = await Promise.all([
      rowsQuery
        .orderBy(sort.field, sort.direction)
        .orderBy('id', 'asc')
        .limit(pagination.limit)
        .offset(pagination.offset)
        .execute<InvitationRow>(),
      countQuery.executeTakeFirst<{ total: number | string }>(),
    ]);
    return {
      items: rows.map((row) => toManagedInvitation(row)),
      total: Number(totalRow?.total ?? 0),
      ...pagination,
    };
  }

  async revokeInvitation(id: string): Promise<InvitationMutationResult> {
    const invitationId = requiredText(id, 'id', 64);
    await this.expireInvitationIfNeeded(invitationId);
    return this.connection.transaction(async (connection) => {
      const row = await connection.query
        .selectFrom<InvitationRow>('hubInvitations')
        .selectAll()
        .where('id', '=', invitationId)
        .executeTakeFirst<InvitationRow>();
      if (!row) {
        throw invitationNotFound();
      }
      const invitation = toManagedInvitation(row);
      if (invitation.status === 'revoked') {
        return { invitation, idempotent: true };
      }
      if (invitation.status === 'accepted') {
        throw new HubDomainError(
          'INVITATION_ALREADY_ACCEPTED',
          'The invitation has already been accepted.',
          { status: 409 },
        );
      }
      if (invitation.status === 'expired') {
        throw invitationExpired();
      }
      const now = this.now();
      const result = await connection.query
        .updateTable<InvitationRow>('hubInvitations')
        .set({ status: 'revoked', revokedAt: now, updatedAt: now })
        .where('id', '=', invitationId)
        .where('status', '=', 'pending')
        .execute();
      if (result.updatedCount !== 1) {
        const current = await connection.query
          .selectFrom<InvitationRow>('hubInvitations')
          .selectAll()
          .where('id', '=', invitationId)
          .executeTakeFirst<InvitationRow>();
        if (!current) throw invitationNotFound();
        const currentInvitation = toManagedInvitation(current);
        if (currentInvitation.status === 'revoked') {
          return { invitation: currentInvitation, idempotent: true };
        }
        if (currentInvitation.status === 'accepted') {
          throw new HubDomainError(
            'INVITATION_ALREADY_ACCEPTED',
            'The invitation has already been accepted.',
            { status: 409 },
          );
        }
        throw invitationExpired();
      }
      const updated = await connection.query
        .selectFrom<InvitationRow>('hubInvitations')
        .selectAll()
        .where('id', '=', invitationId)
        .executeTakeFirst<InvitationRow>();
      if (!updated) throw invitationNotFound();
      return {
        invitation: toManagedInvitation(updated),
        idempotent: false,
      };
    });
  }

  async resolveInvitation(token: string): Promise<ResolvedInvitation> {
    const normalizedToken = normalizeToken(token);
    const row = await this.connection.query
      .selectFrom<InvitationRow>('hubInvitations')
      .selectAll()
      .where('tokenHash', '=', hashInvitationToken(normalizedToken))
      .executeTakeFirst<InvitationRow>();
    if (!row) throw invitationNotFound();
    const invitation = toManagedInvitation(row);
    if (invitation.status === 'accepted') {
      throw new HubDomainError(
        'INVITATION_ALREADY_ACCEPTED',
        'The invitation has already been accepted.',
        { status: 409 },
      );
    }
    if (invitation.status === 'revoked' || invitation.status === 'expired') {
      throw invitationExpired();
    }
    if (new Date(invitation.expiresAt).valueOf() <= this.now().valueOf()) {
      await this.markExpired(invitation.id);
      throw invitationExpired();
    }
    return this.toResolvedInvitation(invitation);
  }

  async acceptInvitation(
    input: AcceptInvitationInput,
  ): Promise<AcceptedInvitation> {
    const token = normalizeToken(input.token);
    const tokenHash = hashInvitationToken(token);
    const name = requiredText(input.name, 'name', 255);
    const username = normalizeUsername(input.username);
    const password = requiredPassword(input.password);

    return this.withTokenLock(tokenHash, async () => {
      try {
        return await this.connection.transaction(async (connection) => {
          const invitationRow = await connection.query
            .selectFrom<InvitationRow>('hubInvitations')
            .selectAll()
            .where('tokenHash', '=', tokenHash)
            .executeTakeFirst<InvitationRow>();
          if (!invitationRow) throw invitationNotFound();
          const invitation = toManagedInvitation(invitationRow);
          assertInvitationCanBeAccepted(invitation, this.now());

          const reservation = await connection.query
            .updateTable<InvitationRow>('hubInvitations')
            .set({ status: 'accepting', updatedAt: this.now() })
            .where('id', '=', invitation.id)
            .where('status', '=', 'pending')
            .where('expiresAt', '>', this.now())
            .execute();
          if (reservation.updatedCount !== 1) {
            const current = await connection.query
              .selectFrom<InvitationRow>('hubInvitations')
              .selectAll()
              .where('id', '=', invitation.id)
              .executeTakeFirst<InvitationRow>();
            if (!current) throw invitationNotFound();
            assertInvitationCanBeAccepted(
              toManagedInvitation(current),
              this.now(),
            );
            throw new HubDomainError(
              'INVITATION_ACCEPTANCE_IN_PROGRESS',
              'The invitation is already being accepted.',
              { status: 409, retryable: true },
            );
          }

          await assertMemberIdentityAvailable(
            connection,
            invitation.email,
            username,
          );
          const user = await this.options.auth.createPasswordUser(
            {
              email: invitation.email,
              password,
              name,
              username,
            },
            { connection },
          );
          const now = this.now();
          await insertAcceptedMemberRecords(
            connection,
            user.id,
            invitation.access,
            now,
          );
          const accepted = await connection.query
            .updateTable<InvitationRow>('hubInvitations')
            .set({
              status: 'accepted',
              acceptedBy: user.id,
              acceptedAt: now,
              updatedAt: now,
            })
            .where('id', '=', invitation.id)
            .where('status', '=', 'accepting')
            .where('acceptedBy', 'is', null)
            .execute();
          if (accepted.updatedCount !== 1) {
            throw new HubDomainError(
              'INVITATION_ACCEPTANCE_CONFLICT',
              'The invitation changed while it was being accepted.',
              { status: 409, retryable: true },
            );
          }
          await appendInvitationAcceptedAudit(
            connection,
            invitation.id,
            user.id,
            invitation.access,
            now,
          );
          return {
            member: {
              id: user.id,
              name: user.name,
              email: user.email,
              username:
                typeof user.username === 'string' ? user.username : null,
              status: 'active',
              roles: acceptedRoleIds(invitation.access),
              applicationIds: invitation.access.applications.map(
                (application) => application.applicationId,
              ),
              lastActiveAt: null,
              createdAt: dateString(user.createdAt),
              revision: 1,
            },
            access: invitation.access,
          };
        });
      } catch (error) {
        throw normalizeAcceptanceError(error);
      }
    });
  }

  private async normalizeAccess(
    input: InvitationAccessInput,
  ): Promise<InvitationAccess> {
    if (!input || typeof input !== 'object') {
      throw validationError('access must be an object.');
    }
    const globalRoles = normalizeRoleList(input.globalRoles, 'globalRoles');
    const applicationValues: unknown = input.applications;
    if (!Array.isArray(applicationValues)) {
      throw validationError('applications must be an array.');
    }
    const normalizedGlobalRoles = this.validateRoles(globalRoles, 'global');
    const normalizedApplications: InvitationApplicationAccess[] = [];
    const seenApplications = new Set<string>();
    for (const application of applicationValues) {
      if (!isRecord(application)) {
        throw validationError('applications contains an invalid item.');
      }
      const applicationId = requiredText(
        application.applicationId,
        'applicationId',
        64,
      );
      if (seenApplications.has(applicationId)) {
        throw validationError('applications contains a duplicate application.');
      }
      seenApplications.add(applicationId);
      const exists = await this.connection.query
        .selectFrom<ApplicationNameRow>('hubApplications')
        .select('id')
        .where('id', '=', applicationId)
        .executeTakeFirst<ApplicationNameRow>();
      if (!exists) {
        throw new HubDomainError(
          'APPLICATION_NOT_FOUND',
          'Application was not found.',
          { status: 404 },
        );
      }
      const roleIds = normalizeRoleList(application.roles, 'roles');
      normalizedApplications.push({
        applicationId,
        roles: this.validateRoles(roleIds, 'application'),
      });
    }
    if (!normalizedGlobalRoles.length && !normalizedApplications.length) {
      throw validationError('At least one role is required.');
    }
    return {
      globalRoles: normalizedGlobalRoles,
      applications: normalizedApplications,
    };
  }

  private validateRoles(
    roleIds: readonly string[],
    scope: 'global' | 'application',
  ): string[] {
    return roleIds.map((roleId) => {
      const role = this.options.roles.get(roleId);
      if (!role || !role.scopes.includes(scope)) {
        throw validationError(
          `Role ${roleId} is not valid for ${scope} scope.`,
        );
      }
      return role.id;
    });
  }

  private async toResolvedInvitation(
    invitation: ManagedInvitation,
  ): Promise<ResolvedInvitation> {
    const applicationIds = invitation.access.applications.map(
      (application) => application.applicationId,
    );
    const applicationRows = applicationIds.length
      ? await this.connection.query
          .selectFrom<ApplicationNameRow>('hubApplications')
          .select(['id', 'name'])
          .where('id', 'in', applicationIds)
          .execute<ApplicationNameRow>()
      : [];
    const applicationNames = new Map(
      applicationRows.map((application) => [application.id, application.name]),
    );
    return {
      email: maskEmail(invitation.email),
      hubDisplayName: this.options.hubDisplayName,
      access: {
        globalRoles: invitation.access.globalRoles.map((id) =>
          this.roleSummary(id),
        ),
        applications: invitation.access.applications.map((application) => ({
          name: requireApplicationName(
            applicationNames,
            application.applicationId,
          ),
          roles: application.roles.map((id) => this.roleSummary(id)),
        })),
      },
      expiresAt: invitation.expiresAt,
    };
  }

  private roleSummary(id: string): ResolvedInvitationRole {
    const role = this.options.roles.get(id);
    if (!role) {
      throw new HubDomainError(
        'INVITATION_ACCESS_INVALID',
        'The invitation references an unknown role.',
        { status: 500 },
      );
    }
    return { id: role.id, name: role.name };
  }

  private async findUserByEmail(
    email: string,
  ): Promise<UserEmailRow | undefined> {
    const users = await this.connection.query
      .selectFrom<UserEmailRow>('user')
      .select(['id', 'email'])
      .execute<UserEmailRow>();
    return users.find((user) => user.email.toLowerCase() === email);
  }

  private async expirePendingInvitations(email: string): Promise<void> {
    const now = this.now();
    await this.connection.query
      .updateTable<InvitationRow>('hubInvitations')
      .set({ status: 'expired', updatedAt: now })
      .where('email', '=', email)
      .where('status', '=', 'pending')
      .where('expiresAt', '<=', now)
      .execute();
  }

  private async expireAllPendingInvitations(): Promise<void> {
    const now = this.now();
    await this.connection.query
      .updateTable<InvitationRow>('hubInvitations')
      .set({ status: 'expired', updatedAt: now })
      .where('status', '=', 'pending')
      .where('expiresAt', '<=', now)
      .execute();
  }

  private async expireInvitationIfNeeded(id: string): Promise<void> {
    const now = this.now();
    await this.connection.query
      .updateTable<InvitationRow>('hubInvitations')
      .set({ status: 'expired', updatedAt: now })
      .where('id', '=', id)
      .where('status', '=', 'pending')
      .where('expiresAt', '<=', now)
      .execute();
  }

  private async markExpired(id: string): Promise<void> {
    await this.connection.query
      .updateTable<InvitationRow>('hubInvitations')
      .set({ status: 'expired', updatedAt: this.now() })
      .where('id', '=', id)
      .where('status', '=', 'pending')
      .execute();
  }

  private async withEmailLock<T>(
    email: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const previous = this.emailTails.get(email) ?? Promise.resolve();
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previous.catch(() => undefined).then(() => gate);
    this.emailTails.set(email, tail);
    await previous.catch(() => undefined);
    try {
      return await operation();
    } finally {
      release?.();
      if (this.emailTails.get(email) === tail) {
        this.emailTails.delete(email);
      }
    }
  }

  private async withTokenLock<T>(
    tokenHash: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    return withKeyedLock(this.tokenTails, tokenHash, operation);
  }

  private now(): Date {
    const now = this.options.clock();
    if (!Number.isFinite(now.valueOf())) {
      throw new HubDomainError(
        'INVALID_TIMESTAMP',
        'Hub returned an invalid timestamp.',
        { status: 500 },
      );
    }
    return now;
  }
}

function toManagedInvitation(row: InvitationRow): ManagedInvitation {
  return {
    id: String(row.id),
    email: String(row.email),
    access: parseAccess(row.access),
    status: invitationStatus(row.status),
    invitedBy: String(row.invitedBy),
    expiresAt: dateString(row.expiresAt),
    acceptedBy: nullableString(row.acceptedBy),
    acceptedAt: nullableDateString(row.acceptedAt),
    revokedAt: nullableDateString(row.revokedAt),
    createdAt: dateString(row.createdAt),
    updatedAt: dateString(row.updatedAt),
  };
}

function assertInvitationCanBeAccepted(
  invitation: ManagedInvitation,
  now: Date,
): void {
  if (invitation.status === 'accepted') {
    throw new HubDomainError(
      'INVITATION_ALREADY_ACCEPTED',
      'The invitation has already been accepted.',
      { status: 409 },
    );
  }
  if (
    invitation.status === 'revoked' ||
    invitation.status === 'expired' ||
    new Date(invitation.expiresAt).valueOf() <= now.valueOf()
  ) {
    throw invitationExpired();
  }
  if (invitation.status !== 'pending') {
    throw new HubDomainError(
      'INVITATION_ACCEPTANCE_IN_PROGRESS',
      'The invitation is already being accepted.',
      { status: 409, retryable: true },
    );
  }
}

async function assertMemberIdentityAvailable(
  connection: DatabaseConnection,
  email: string,
  username: string,
): Promise<void> {
  const members = await connection.query
    .selectFrom<MemberIdentityRow>('user')
    .select(['id', 'email', 'username'])
    .execute<MemberIdentityRow>();
  if (members.some((member) => member.email.toLowerCase() === email)) {
    throw new HubDomainError(
      'INVITATION_ALREADY_EXISTS',
      'A Hub member already exists for this invitation email.',
      { status: 409 },
    );
  }
  if (
    members.some(
      (member) => member.username?.toLowerCase() === username.toLowerCase(),
    )
  ) {
    throw duplicateUsernameError();
  }
}

async function insertAcceptedMemberRecords(
  connection: DatabaseConnection,
  userId: string,
  access: InvitationAccess,
  now: Date,
): Promise<void> {
  await connection.query
    .insertInto('hubMemberStatuses')
    .values({
      userId,
      status: 'active',
      disabledAt: null,
      disabledBy: null,
      lastActiveAt: null,
      revision: 1,
      createdAt: now,
      updatedAt: now,
    })
    .execute();
  for (const role of access.globalRoles) {
    await insertRoleAssignment(connection, userId, role, null, now);
  }
  for (const application of access.applications) {
    for (const role of application.roles) {
      await insertRoleAssignment(
        connection,
        userId,
        role,
        application.applicationId,
        now,
      );
    }
  }
  await connection.query
    .insertInto('hubAssignmentRevisions')
    .values({
      scopeType: 'member',
      scopeId: userId,
      revision: 1,
      updatedAt: now,
    })
    .execute();
  for (const application of access.applications) {
    await bumpOrCreateApplicationRevision(
      connection,
      application.applicationId,
      now,
    );
  }
}

async function insertRoleAssignment(
  connection: DatabaseConnection,
  userId: string,
  role: string,
  applicationId: string | null,
  now: Date,
): Promise<void> {
  await connection.query
    .insertInto('hubRoleAssignments')
    .values({
      id: randomUUID(),
      userId,
      role,
      applicationId,
      disabled: false,
      createdAt: now,
      updatedAt: now,
    })
    .execute();
}

async function bumpOrCreateApplicationRevision(
  connection: DatabaseConnection,
  applicationId: string,
  now: Date,
): Promise<void> {
  const updated = await connection.query
    .updateTable('hubAssignmentRevisions')
    .set({
      revision: (await readAssignmentRevision(connection, applicationId)) + 1,
      updatedAt: now,
    })
    .where('scopeType', '=', 'application')
    .where('scopeId', '=', applicationId)
    .execute();
  if (updated.updatedCount === 0) {
    await connection.query
      .insertInto('hubAssignmentRevisions')
      .values({
        scopeType: 'application',
        scopeId: applicationId,
        revision: 1,
        updatedAt: now,
      })
      .execute();
  }
}

async function readAssignmentRevision(
  connection: DatabaseConnection,
  applicationId: string,
): Promise<number> {
  const row = await connection.query
    .selectFrom('hubAssignmentRevisions')
    .select('revision')
    .where('scopeType', '=', 'application')
    .where('scopeId', '=', applicationId)
    .executeTakeFirst<{ revision: number | string }>();
  return Number(row?.revision ?? 0);
}

async function appendInvitationAcceptedAudit(
  connection: DatabaseConnection,
  invitationId: string,
  userId: string,
  access: InvitationAccess,
  now: Date,
): Promise<void> {
  await connection.query
    .insertInto('hubAuditLogs')
    .values({
      id: randomUUID(),
      actorId: userId,
      applicationId: null,
      action: 'member.updated',
      resource: 'member',
      resourceId: userId,
      result: 'success',
      source: 'web',
      client: null,
      failureCode: null,
      details: JSON.stringify({
        change: 'invitationAccepted',
        invitationId,
        globalRoles: access.globalRoles,
        applicationIds: access.applications.map(
          (application) => application.applicationId,
        ),
      }),
      requestId: null,
      createdAt: now,
    })
    .execute();
}

function acceptedRoleIds(access: InvitationAccess): string[] {
  return [
    ...new Set([
      ...access.globalRoles,
      ...access.applications.flatMap((application) => application.roles),
    ]),
  ];
}

function parseAccess(value: unknown): InvitationAccess {
  let parsed: unknown = value;
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed) as unknown;
    } catch (error) {
      throw new HubDomainError(
        'INVITATION_ACCESS_INVALID',
        'The invitation access data is invalid.',
        { status: 500, cause: error },
      );
    }
  }
  if (!isRecord(parsed)) {
    throw new HubDomainError(
      'INVITATION_ACCESS_INVALID',
      'The invitation access data is invalid.',
      { status: 500 },
    );
  }
  const globalRoles = parsed.globalRoles;
  const applications = parsed.applications;
  if (
    !Array.isArray(globalRoles) ||
    !globalRoles.every((role) => typeof role === 'string') ||
    !Array.isArray(applications)
  ) {
    throw new HubDomainError(
      'INVITATION_ACCESS_INVALID',
      'The invitation access data is invalid.',
      { status: 500 },
    );
  }
  const normalizedApplications: InvitationApplicationAccess[] = [];
  for (const application of applications) {
    if (!isRecord(application)) {
      throw new HubDomainError(
        'INVITATION_ACCESS_INVALID',
        'The invitation access data is invalid.',
        { status: 500 },
      );
    }
    const applicationId = application.applicationId;
    const roles = application.roles;
    if (
      typeof applicationId !== 'string' ||
      !Array.isArray(roles) ||
      !roles.every((role) => typeof role === 'string')
    ) {
      throw new HubDomainError(
        'INVITATION_ACCESS_INVALID',
        'The invitation access data is invalid.',
        { status: 500 },
      );
    }
    normalizedApplications.push({
      applicationId,
      roles: [...roles],
    });
  }
  return {
    globalRoles: [...globalRoles],
    applications: normalizedApplications,
  };
}

function normalizeRoleList(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) {
    throw validationError(`${field} must be an array.`);
  }
  const values: string[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    const role = requiredText(entry, field, 64);
    if (!seen.has(role)) {
      seen.add(role);
      values.push(role);
    }
  }
  return values;
}

function normalizeEmail(value: unknown): string {
  if (typeof value !== 'string') throw validationError('email is required.');
  const email = value.trim().toLowerCase();
  if (
    email.length < 3 ||
    email.length > 320 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    throw validationError('email is invalid.');
  }
  return email;
}

function normalizeUsername(value: unknown): string {
  const username = requiredText(value, 'username', 30).toLowerCase();
  if (username.length < 3 || !/^[a-z0-9_.]+$/.test(username)) {
    throw new HubDomainError('VALIDATION_ERROR', 'username is invalid.', {
      status: 422,
      issues: [
        {
          path: 'username',
          code: 'INVALID_FORMAT',
          message: 'username is invalid.',
        },
      ],
    });
  }
  return username;
}

function requiredPassword(value: unknown): string {
  if (typeof value !== 'string' || value.length < 8 || value.length > 128) {
    throw new HubDomainError(
      'VALIDATION_ERROR',
      'password must contain between 8 and 128 characters.',
      {
        status: 422,
        issues: [
          {
            path: 'password',
            code: 'INVALID_LENGTH',
            message: 'password must contain between 8 and 128 characters.',
          },
        ],
      },
    );
  }
  return value;
}

function normalizeExpiryDays(value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < MIN_EXPIRY_DAYS ||
    value > MAX_EXPIRY_DAYS
  ) {
    throw validationError(
      `expiresInDays must be between ${MIN_EXPIRY_DAYS} and ${MAX_EXPIRY_DAYS}.`,
    );
  }
  return value;
}

function normalizeAcceptanceUrl(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new HubDomainError(
      'INVITATION_ACCEPTANCE_URL_REQUIRED',
      'The invitation acceptance URL is required.',
      { status: 500 },
    );
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch (error) {
    throw new HubDomainError(
      'INVITATION_ACCEPTANCE_URL_INVALID',
      'The invitation acceptance URL is invalid.',
      { status: 500, cause: error },
    );
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new HubDomainError(
      'INVITATION_ACCEPTANCE_URL_INVALID',
      'The invitation acceptance URL must not contain credentials, query, or fragment data.',
      { status: 500 },
    );
  }
  return url.toString().replace(/\/$/, '');
}

function resolveAcceptanceUrl(value: string | undefined): string {
  if (!value) {
    throw new HubDomainError(
      'INVITATION_ACCEPTANCE_URL_REQUIRED',
      'The invitation acceptance URL is required.',
      { status: 500 },
    );
  }
  return normalizeAcceptanceUrl(value);
}

function buildInviteUrl(baseUrl: string, token: string): string {
  return `${baseUrl}#token=${encodeURIComponent(token)}`;
}

function createInvitationToken(): string {
  return `${TOKEN_PREFIX}${randomBytes(TOKEN_BYTES).toString('base64url')}`;
}

function normalizeToken(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !new RegExp(`^${TOKEN_PREFIX}[A-Za-z0-9_-]{43}$`).test(value)
  ) {
    throw invitationNotFound();
  }
  return value;
}

function hashInvitationToken(token: string): string {
  return `sha256:${createHash('sha256').update(token).digest('hex')}`;
}

function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at <= 0) return '*';
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (local.length === 1) return `*@${domain}`;
  if (local.length === 2) return `${local[0]}*@${domain}`;
  return `${local[0]}${'*'.repeat(local.length - 2)}${local.at(-1)}@${domain}`;
}

function normalizeQuery(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? '';
}

function normalizePagination(options: { limit?: number; offset?: number }): {
  limit: number;
  offset: number;
} {
  const limit = options.limit ?? DEFAULT_LIMIT;
  const offset = options.offset ?? 0;
  if (
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > MAX_LIMIT ||
    !Number.isSafeInteger(offset) ||
    offset < 0
  ) {
    throw new HubDomainError('INVALID_QUERY', 'limit or offset is invalid.', {
      status: 422,
    });
  }
  return { limit, offset };
}

function invitationOrder(sort: InvitationSort = '-createdAt'): {
  field: 'createdAt' | 'expiresAt';
  direction: 'asc' | 'desc';
} {
  const descending = sort.startsWith('-');
  const field = descending ? sort.slice(1) : sort;
  if (field !== 'createdAt' && field !== 'expiresAt') {
    throw new HubDomainError('INVALID_QUERY', 'sort is invalid.', {
      status: 422,
    });
  }
  return { field, direction: descending ? 'desc' : 'asc' };
}

function requireApplicationName(
  names: ReadonlyMap<string, string>,
  applicationId: string,
): string {
  const name = names.get(applicationId);
  if (!name) {
    throw new HubDomainError(
      'INVITATION_ACCESS_INVALID',
      'The invitation references an unavailable application.',
      { status: 500 },
    );
  }
  return name;
}

function invitationStatus(value: string): InvitationStatus {
  if (
    value === 'pending' ||
    value === 'accepted' ||
    value === 'expired' ||
    value === 'revoked'
  ) {
    return value;
  }
  throw new HubDomainError(
    'INVITATION_STATUS_INVALID',
    'The invitation contains an invalid status.',
    { status: 500 },
  );
}

function dateString(value: Date | string | number): string {
  const date = asDate(value);
  return date.toISOString();
}

function nullableDateString(
  value: Date | string | number | null,
): string | null {
  return value === null ? null : dateString(value);
}

function asDate(value: Date | string | number): Date {
  let date: Date;
  if (value instanceof Date) {
    date = new Date(value);
  } else if (typeof value === 'number') {
    date = new Date(value);
  } else if (/^-?\d+$/.test(value)) {
    date = new Date(Number(value));
  } else {
    date = new Date(value);
  }
  if (!Number.isFinite(date.valueOf())) {
    throw new HubDomainError(
      'INVALID_TIMESTAMP',
      'Hub returned an invalid timestamp.',
      { status: 500 },
    );
  }
  return date;
}

function nullableString(value: string | null): string | null {
  return value === null ? null : String(value);
}

function requiredText(
  value: unknown,
  field: string,
  maxLength: number,
): string {
  if (typeof value !== 'string') {
    throw validationError(`${field} is required.`);
  }
  const text = value.trim();
  if (!text || text.length > maxLength) {
    throw validationError(`${field} is invalid.`);
  }
  return text;
}

function validationError(message: string): HubDomainError {
  return new HubDomainError('VALIDATION_ERROR', message, { status: 422 });
}

function invitationNotFound(): HubDomainError {
  return new HubDomainError(
    'INVITATION_NOT_FOUND',
    'Invitation was not found.',
    { status: 404 },
  );
}

function invitationExpired(): HubDomainError {
  return new HubDomainError(
    'INVITATION_EXPIRED',
    'The invitation has expired or was revoked.',
    { status: 410 },
  );
}

function duplicateUsernameError(cause?: unknown): HubDomainError {
  return new HubDomainError(
    'VALIDATION_ERROR',
    'The username is already in use.',
    {
      status: 422,
      issues: [
        {
          path: 'username',
          code: 'ALREADY_EXISTS',
          message: 'The username is already in use.',
        },
      ],
      ...(cause === undefined ? {} : { cause }),
    },
  );
}

function normalizeAcceptanceError(error: unknown): HubDomainError {
  if (error instanceof HubDomainError) return error;
  if (error instanceof PasswordUserCreationError) {
    switch (error.code) {
      case 'EMAIL_ALREADY_EXISTS':
        return new HubDomainError(
          'INVITATION_ALREADY_EXISTS',
          'A Hub member already exists for this invitation email.',
          { status: 409, cause: error },
        );
      case 'USERNAME_ALREADY_EXISTS':
        return duplicateUsernameError(error);
      case 'INVALID_EMAIL':
        return authenticationFieldError(
          'email',
          'The invitation email is invalid.',
          error,
        );
      case 'INVALID_USERNAME':
        return authenticationFieldError(
          'username',
          'The username is invalid.',
          error,
        );
      case 'INVALID_PASSWORD':
        return authenticationFieldError(
          'password',
          'The password is invalid.',
          error,
        );
      case 'USER_NOT_PERSISTED':
      case 'CREDENTIAL_ACCOUNT_NOT_PERSISTED':
      case 'CREATION_FAILED':
        return invitationAcceptanceFailed(error);
    }
  }
  const message = error instanceof Error ? error.message : String(error);
  const code = errorCode(error);
  if (
    /user\.username|username.*(?:exist|unique|taken)/i.test(message) ||
    /username.*(?:exist|unique|taken)/i.test(code)
  ) {
    return duplicateUsernameError(error);
  }
  if (
    /user\.email|email.*(?:exist|unique|taken)/i.test(message) ||
    /user.*already.*exist|email.*(?:exist|unique|taken)/i.test(code)
  ) {
    return new HubDomainError(
      'INVITATION_ALREADY_EXISTS',
      'A Hub member already exists for this invitation email.',
      { status: 409, cause: error },
    );
  }
  return invitationAcceptanceFailed(error);
}

function authenticationFieldError(
  field: 'email' | 'username' | 'password',
  message: string,
  cause: unknown,
): HubDomainError {
  return new HubDomainError('VALIDATION_ERROR', message, {
    status: 422,
    issues: [{ path: field, code: 'INVALID_VALUE', message }],
    cause,
  });
}

function invitationAcceptanceFailed(error: unknown): HubDomainError {
  return new HubDomainError(
    'INVITATION_ACCEPTANCE_FAILED',
    'The invitation could not be accepted.',
    { status: 500, cause: error },
  );
}

function errorCode(error: unknown): string {
  if (!isRecord(error)) return '';
  if (typeof error.code === 'string') return error.code;
  if (isRecord(error.body) && typeof error.body.code === 'string') {
    return error.body.code;
  }
  return '';
}

async function withKeyedLock<T>(
  tails: Map<string, Promise<void>>,
  key: string,
  operation: () => Promise<T>,
): Promise<T> {
  const previous = tails.get(key) ?? Promise.resolve();
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = previous.catch(() => undefined).then(() => gate);
  tails.set(key, tail);
  await previous.catch(() => undefined);
  try {
    return await operation();
  } finally {
    release?.();
    if (tails.get(key) === tail) tails.delete(key);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isUniqueConstraintError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /unique|constraint/i.test(message);
}

function escapeLike(value: string): string {
  return value.replaceAll(/[\\%_]/g, (character) => `\\${character}`);
}

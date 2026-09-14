import type {
  AuthorizationScope,
  AuthorizationGrant,
  AuthorizationGrantService,
  ResolveAuthorizationGrantsInput,
  ResolveAllAuthorizationGrantsInput,
  AuthorizationPlugin,
  AuthorizationSubject,
  AuthorizationIdentity,
  Principal,
} from '../../core/index.js';
import { resolveAuthorizationSubjects } from '../../core/index.js';
import type {
  PermissionGrant,
  PermissionSet,
  PermissionSetAssignment,
  PermissionSetSubject,
} from './model.js';
import type { DatabaseConnection } from '@nocobase/db';
import { createPermissionSetHandler } from './routes.js';
import { DatabasePermissionSetStore } from './database-store.js';
import type { PermissionSetStore } from './store.js';

export interface CreatePermissionSetInput {
  key: string;
  title?: string;
  grants: readonly PermissionGrant[];
}

export interface AssignPermissionSetInput {
  id?: string;
  subject: PermissionSetSubject;
  permissionSet: string;
}

export interface PermissionSetsApi<TTransaction = DatabaseConnection> {
  create(input: CreatePermissionSetInput): Promise<PermissionSet>;
  update(key: string, input: CreatePermissionSetInput): Promise<PermissionSet>;
  delete(key: string): Promise<void>;
  get(key: string): Promise<PermissionSet | undefined>;
  list(): Promise<readonly PermissionSet[]>;
  assign(input: AssignPermissionSetInput): Promise<PermissionSetAssignment>;
  revoke(id: string): Promise<void>;
  listAssignments(
    permissionSet?: string,
  ): Promise<readonly PermissionSetAssignment[]>;
  replaceSubjectAssignments(input: {
    subject: PermissionSetSubject;
    managedPermissionSets: readonly string[];
    permissionSets: readonly string[];
  }): Promise<readonly PermissionSetAssignment[]>;
  notifyAssignmentsChanged(subject: PermissionSetSubject): Promise<void>;
  /**
   * Throws when removing this subject would leave a Permission Set that
   * requires an active assignment without one.
   */
  assertSubjectRemovable(subject: PermissionSetSubject): Promise<void>;
  /**
   * Returns an API bound to the caller's transaction. The caller owns the
   * transaction and publishes assignment changes after it commits, so the
   * bound API does not call onAssignmentsChanged.
   */
  withTransaction(transaction: TTransaction): PermissionSetsApi<TTransaction>;
  /**
   * Marks Permission Sets as owned by code. The generic management surface
   * (the HTTP handler) refuses to change them; the owner's own code still can.
   * Returns a function that lifts the protection again.
   */
  protect(protection: PermissionSetProtection): () => void;
  protection(key: string): PermissionSetProtectionInfo | undefined;
  /** Throws PermissionSetProtectedError when the operation is not allowed on a protected Permission Set. */
  assertWritable(key: string, operation: PermissionSetWriteOperation): void;
  isUnrestricted(key: string): boolean;
  /** True when the identity holds at least one unrestricted Permission Set. */
  unrestricted(identity: AuthorizationIdentity): Promise<boolean>;
  getEffective(input: {
    principal: Principal;
    subjects?: readonly AuthorizationSubject[];
  }): Promise<readonly PermissionSet[]>;
  handler(input: PermissionSetHandlerInput): Promise<Response>;
}

export type PermissionSetWriteOperation =
  'create' | 'update' | 'delete' | 'assign' | 'revoke';

export interface PermissionSetProtection {
  /** Who registers the protection, usually a plugin package name. */
  owner: string;
  keys: readonly string[];
  /** Operations the generic management surface may still perform. */
  allow?: readonly PermissionSetWriteOperation[];
  /**
   * The set must always keep at least one assignment that can still act, so
   * an installation cannot revoke or disable its way out of the access the
   * set is the only source of. Independent of unrestricted access.
   */
  requireActiveAssignment?: boolean;
  /**
   * Holding the set grants unrestricted access: authorization is skipped
   * entirely, including Sharing and Restriction Rules. It is declared here
   * rather than on its own, so a set that confers it is always protected as
   * well: an unprotected superuser set should not exist.
   */
  unrestricted?: boolean;
}

export interface PermissionSetProtectionInfo {
  owner: string;
  allow: readonly PermissionSetWriteOperation[];
  /** Present only when the set requires an active assignment. */
  requireActiveAssignment?: boolean;
  /** Present only when holding the set grants unrestricted access. */
  unrestricted?: boolean;
}

export class PermissionSetProtectedError extends Error {
  readonly key: string;
  readonly owner: string;
  readonly operation: PermissionSetWriteOperation;

  constructor(
    key: string,
    owner: string,
    operation: PermissionSetWriteOperation,
  ) {
    super(
      `The ${key} Permission Set and its assignments are protected by ${owner}.`,
    );
    this.name = 'PermissionSetProtectedError';
    this.key = key;
    this.owner = owner;
    this.operation = operation;
  }
}

export class PermissionSetLastAssignmentError extends Error {
  readonly key: string;

  constructor(key: string) {
    super(
      `The last active assignment of the ${key} Permission Set cannot be removed.`,
    );
    this.name = 'PermissionSetLastAssignmentError';
    this.key = key;
  }
}

export interface PermissionSetHandlerInput {
  request: Request;
  authorization: Pick<AuthorizationScope, 'require'>;
  basePath?: string;
}

export interface PermissionSetsOptions<TTransaction = DatabaseConnection> {
  /** Overrides the database-backed store, primarily for custom backends and tests. */
  store?: PermissionSetStore<TTransaction>;
  onAssignmentsChanged?(subject: PermissionSetSubject): void | Promise<void>;
  /**
   * Narrows subjects to the ones that can still act. Authorization does not
   * own account state, so an application that can disable a user supplies
   * this. Without it every assignment counts. It is handed the caller's
   * transaction when there is one, so it reads the same snapshot the check
   * has already locked rather than blocking on it from outside.
   */
  filterActiveSubjects?(
    subjects: readonly PermissionSetSubject[],
    transaction?: TTransaction,
  ): Promise<readonly PermissionSetSubject[]>;
}

export class PermissionSetNotFoundError extends Error {
  constructor(key: string) {
    super(`Unknown Permission Set: ${key}`);
    this.name = 'PermissionSetNotFoundError';
  }
}

export class PermissionSetConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PermissionSetConflictError';
  }
}

export interface PermissionSetsAuthorizationApi<
  TTransaction = DatabaseConnection,
> {
  permissionSets: PermissionSetsApi<TTransaction>;
}

export type PermissionSetsPlugin<TTransaction = DatabaseConnection> =
  AuthorizationPlugin<PermissionSetsAuthorizationApi<TTransaction>>;

/**
 * The default store binds transactions to a DatabaseConnection, so the
 * transaction handle is a DatabaseConnection unless a custom store declares
 * another one.
 */
export function permissionSets(
  options?: PermissionSetsOptions<DatabaseConnection>,
): PermissionSetsPlugin<DatabaseConnection>;
export function permissionSets<TTransaction>(
  options: PermissionSetsOptions<TTransaction>,
): PermissionSetsPlugin<TTransaction>;
export function permissionSets(
  options: PermissionSetsOptions<DatabaseConnection> = {},
): PermissionSetsPlugin<DatabaseConnection> {
  const service = new PermissionSetService(options);
  return {
    id: 'permission-sets',
    grants: service,
    authorizationApi: { permissionSets: service },
    setup(authz): void {
      if (!options.store) {
        if (!authz.connection) {
          throw new Error(
            'Permission Sets requires createAuthorization({ connection }) or an explicit store',
          );
        }
        service.initialize(new DatabasePermissionSetStore(authz.connection));
      }
      authz.resources.add({
        resourceType: 'authorization.settings',
        async authorize(request, context) {
          const grants = await context.grants.resolve({
            principal: request.principal,
            subjects: request.subjects,
            resource: request.resource,
            action: request.action,
          });
          return grants.length > 0
            ? {
                effect: 'permit',
                reasons: grants.map((grant) => ({
                  code: 'PERMISSION_SET_ADMINISTRATION_GRANTED',
                  message: `${grant.source.plugin}:${grant.source.id} allows Authorization settings administration`,
                  plugin: 'permission-sets',
                })),
              }
            : {
                effect: 'deny',
                reasons: [
                  {
                    code: 'PERMISSION_SET_ADMINISTRATION_DENIED',
                    message:
                      'Authorization settings administration is not allowed',
                    plugin: 'permission-sets',
                  },
                ],
              };
        },
      });
    },
  };
}

class PermissionSetService<TTransaction = DatabaseConnection>
  implements AuthorizationGrantService, PermissionSetsApi<TTransaction>
{
  private store?: PermissionSetStore<TTransaction>;
  private readonly protections: Map<string, PermissionSetProtectionInfo>;
  readonly handler: (input: PermissionSetHandlerInput) => Promise<Response>;

  constructor(
    private readonly options: PermissionSetsOptions<TTransaction> = {},
    protections: Map<string, PermissionSetProtectionInfo> = new Map(),
    private readonly transaction?: TTransaction,
  ) {
    this.store = options.store;
    this.protections = protections;
    this.handler = createPermissionSetHandler(this);
  }

  isUnrestricted(key: string): boolean {
    return this.protections.get(key)?.unrestricted === true;
  }

  async unrestricted(identity: AuthorizationIdentity): Promise<boolean> {
    if (!this.hasUnrestrictedSets()) return false;
    return this.setsAreUnrestricted(await this.getEffective(identity));
  }

  protect(protection: PermissionSetProtection): () => void {
    const allow = [...new Set(protection.allow ?? [])];
    const registered: string[] = [];
    for (const key of protection.keys) {
      const existing = this.protections.get(key);
      if (existing && existing.owner !== protection.owner) {
        throw new Error(
          `Permission Set "${key}" is already protected by ${existing.owner}`,
        );
      }
      this.protections.set(key, {
        owner: protection.owner,
        allow,
        ...(protection.requireActiveAssignment
          ? { requireActiveAssignment: true }
          : {}),
        ...(protection.unrestricted ? { unrestricted: true } : {}),
      });
      registered.push(key);
    }
    return (): void => {
      for (const key of registered) {
        if (this.protections.get(key)?.owner === protection.owner) {
          this.protections.delete(key);
        }
      }
    };
  }

  protection(key: string): PermissionSetProtectionInfo | undefined {
    return this.protections.get(key);
  }

  assertWritable(key: string, operation: PermissionSetWriteOperation): void {
    const protection = this.protections.get(key);
    if (!protection || protection.allow.includes(operation)) return;
    throw new PermissionSetProtectedError(key, protection.owner, operation);
  }

  initialize(store: PermissionSetStore<TTransaction>): void {
    if (this.store) {
      throw new Error('Permission Sets store has already been initialized');
    }
    this.store = store;
  }

  async resolve(
    input: ResolveAuthorizationGrantsInput,
  ): Promise<readonly AuthorizationGrant[]> {
    const grants = await this.resolveAll({
      principal: input.principal,
      subjects: input.subjects,
    });
    return grants
      .filter(
        (grant) =>
          this.resourceMatches(grant.resource, input.resource) &&
          grant.action === input.action,
      )
      .map((grant) => ({ ...grant, resource: input.resource }));
  }

  async resolveAll(
    input: ResolveAllAuthorizationGrantsInput,
  ): Promise<readonly AuthorizationGrant[]> {
    return this.toGrants(await this.getEffective(input));
  }

  scope(identity: AuthorizationIdentity): AuthorizationGrantService {
    // One store read per request: every derived answer comes from this promise.
    let sets: Promise<readonly PermissionSet[]> | undefined;
    const effective = (): Promise<readonly PermissionSet[]> => {
      sets ??= this.getEffective(identity);
      return sets;
    };
    let grants: Promise<readonly AuthorizationGrant[]> | undefined;
    const resolveAll = (): Promise<readonly AuthorizationGrant[]> => {
      grants ??= effective().then((resolved) => this.toGrants(resolved));
      return grants;
    };
    return {
      resolve: async (input) =>
        (await resolveAll())
          .filter(
            (grant) =>
              this.resourceMatches(grant.resource, input.resource) &&
              grant.action === input.action,
          )
          .map((grant) => ({ ...grant, resource: input.resource })),
      resolveAll,
      unrestricted: async () =>
        this.hasUnrestrictedSets() &&
        this.setsAreUnrestricted(await effective()),
    };
  }

  private hasUnrestrictedSets(): boolean {
    for (const protection of this.protections.values()) {
      if (protection.unrestricted) return true;
    }
    return false;
  }

  private setsAreUnrestricted(sets: readonly PermissionSet[]): boolean {
    return sets.some((set) => this.isUnrestricted(set.key));
  }

  private toGrants(
    sets: readonly PermissionSet[],
  ): readonly AuthorizationGrant[] {
    return sets.flatMap((set) =>
      set.grants.flatMap((grant) =>
        grant.actions.map((action): AuthorizationGrant => ({
          source: { plugin: 'permission-sets', id: set.key },
          resource: grant.resource,
          action: action.action,
          ...(action.policy === undefined ? {} : { policy: action.policy }),
        })),
      ),
    );
  }

  getEffective(input: {
    principal: Principal;
    subjects?: readonly AuthorizationSubject[];
  }): Promise<readonly PermissionSet[]> {
    return this.resolvePermissionSets(input);
  }

  async create(input: CreatePermissionSetInput): Promise<PermissionSet> {
    if (await this.getStore().getPermissionSet(input.key)) {
      throw new PermissionSetConflictError(
        `Permission Set already exists: ${input.key}`,
      );
    }
    return this.getStore().createPermissionSet(this.toPermissionSet(input));
  }

  async update(
    key: string,
    input: CreatePermissionSetInput,
  ): Promise<PermissionSet> {
    if (!(await this.getStore().getPermissionSet(key))) {
      throw new PermissionSetNotFoundError(key);
    }
    if (
      key !== input.key &&
      (await this.getStore().getPermissionSet(input.key))
    ) {
      throw new PermissionSetConflictError(
        `Permission Set already exists: ${input.key}`,
      );
    }
    const affectedSubjects = await this.assignedSubjects(key);
    const permissionSet = await this.getStore().updatePermissionSet(
      key,
      this.toPermissionSet(input),
    );
    await this.notifySubjectsChanged(affectedSubjects);
    return permissionSet;
  }

  async delete(key: string): Promise<void> {
    if (!(await this.getStore().getPermissionSet(key))) {
      throw new PermissionSetNotFoundError(key);
    }
    const affectedSubjects = await this.assignedSubjects(key);
    await this.getStore().deletePermissionSet(key);
    await this.notifySubjectsChanged(affectedSubjects);
  }

  get(key: string): Promise<PermissionSet | undefined> {
    return this.getStore().getPermissionSet(key);
  }

  list(): Promise<readonly PermissionSet[]> {
    return this.getStore().listPermissionSets();
  }

  async assign(
    input: AssignPermissionSetInput,
  ): Promise<PermissionSetAssignment> {
    if (!(await this.getStore().getPermissionSet(input.permissionSet))) {
      throw new PermissionSetNotFoundError(input.permissionSet);
    }
    const assignment = await this.getStore().assignPermissionSet({
      id: input.id ?? this.createAssignmentId(input),
      subject: input.subject,
      permissionSet: input.permissionSet,
    });
    await this.notifyAssignmentsChanged(input.subject);
    return assignment;
  }

  async revoke(id: string): Promise<void> {
    const assignment = (await this.getStore().listAssignments()).find(
      (item) => item.id === id,
    );
    if (assignment) await this.assertRetainsAssignment(assignment);
    await this.getStore().revokeAssignment(id);
    if (assignment) {
      await this.notifyAssignmentsChanged(assignment.subject);
    }
  }

  listAssignments(
    permissionSet?: string,
  ): Promise<readonly PermissionSetAssignment[]> {
    return this.getStore().listAssignments(permissionSet);
  }

  async replaceSubjectAssignments(input: {
    subject: PermissionSetSubject;
    managedPermissionSets: readonly string[];
    permissionSets: readonly string[];
  }): Promise<readonly PermissionSetAssignment[]> {
    const managed = new Set(input.managedPermissionSets);
    const requested = [...new Set(input.permissionSets)];
    if (requested.some((key) => !managed.has(key))) {
      throw new TypeError(
        'Replacement Permission Sets must belong to the managed scope',
      );
    }
    for (const key of requested) {
      if (!(await this.getStore().getPermissionSet(key))) {
        throw new PermissionSetNotFoundError(key);
      }
    }
    const existing = (await this.getStore().listAssignments()).filter(
      (assignment) =>
        assignment.subject.type === input.subject.type &&
        assignment.subject.id === input.subject.id &&
        managed.has(assignment.permissionSet),
    );
    const requestedSet = new Set(requested);
    const removed = existing.filter(
      (assignment) => !requestedSet.has(assignment.permissionSet),
    );
    // Refuse the whole replacement before it writes anything.
    for (const assignment of removed) {
      await this.assertRetainsAssignment(assignment);
    }
    for (const assignment of removed) {
      await this.getStore().revokeAssignment(assignment.id);
    }
    const existingKeys = new Set(
      existing.map((assignment) => assignment.permissionSet),
    );
    const created: PermissionSetAssignment[] = [];
    for (const permissionSet of requested) {
      if (existingKeys.has(permissionSet)) continue;
      const assignment: PermissionSetAssignment = {
        id: this.createAssignmentId({
          subject: input.subject,
          permissionSet,
        }),
        subject: input.subject,
        permissionSet,
      };
      created.push(await this.getStore().assignPermissionSet(assignment));
    }
    if (created.length > 0 || removed.length > 0) {
      await this.notifyAssignmentsChanged(input.subject);
    }
    const kept = existing.filter((assignment) =>
      requestedSet.has(assignment.permissionSet),
    );
    return [...kept, ...created];
  }

  async notifyAssignmentsChanged(subject: PermissionSetSubject): Promise<void> {
    await this.options.onAssignmentsChanged?.(subject);
  }

  withTransaction(transaction: TTransaction): PermissionSetsApi<TTransaction> {
    return new PermissionSetService<TTransaction>(
      {
        ...this.options,
        store: this.getStore().withTransaction(transaction),
        // The caller that owns the transaction publishes after commit.
        onAssignmentsChanged: undefined,
      },
      this.protections,
      transaction,
    );
  }

  async assertSubjectRemovable(subject: PermissionSetSubject): Promise<void> {
    const assignments = await this.getStore().listAssignments();
    for (const assignment of assignments) {
      if (
        assignment.subject.type === subject.type &&
        assignment.subject.id === subject.id
      ) {
        await this.assertRetainsAssignment(assignment);
      }
    }
  }

  /**
   * A Permission Set that requires an active assignment is the only source of
   * the access it grants, so removing its last one would leave nobody able to
   * restore it.
   */
  private async assertRetainsAssignment(
    removing: PermissionSetAssignment,
  ): Promise<void> {
    const key = removing.permissionSet;
    if (!this.protections.get(key)?.requireActiveAssignment) return;
    // Lock before reading, so two concurrent removals cannot both see the
    // other assignment that each of them is about to take away.
    await this.getStore().lock?.(key);
    const remaining = (await this.getStore().listAssignments(key)).filter(
      (assignment) => assignment.id !== removing.id,
    );
    const active = await this.activeSubjects(
      remaining.map((assignment) => assignment.subject),
    );
    if (active.length === 0) {
      throw new PermissionSetLastAssignmentError(key);
    }
  }

  /** Every subject counts until the application says which ones can act. */
  private async activeSubjects(
    subjects: readonly PermissionSetSubject[],
  ): Promise<readonly PermissionSetSubject[]> {
    return (
      (await this.options.filterActiveSubjects?.(subjects, this.transaction)) ??
      subjects
    );
  }

  private getStore(): PermissionSetStore<TTransaction> {
    if (!this.store) {
      throw new Error('Permission Sets has not been initialized');
    }
    return this.store;
  }

  private async assignedSubjects(
    permissionSet: string,
  ): Promise<readonly PermissionSetSubject[]> {
    const assignments = await this.getStore().listAssignments(permissionSet);
    const subjects = new Map<string, PermissionSetSubject>();
    for (const assignment of assignments) {
      subjects.set(
        `${assignment.subject.type}\u0000${assignment.subject.id}`,
        assignment.subject,
      );
    }
    return [...subjects.values()];
  }

  private async notifySubjectsChanged(
    subjects: readonly PermissionSetSubject[],
  ): Promise<void> {
    for (const subject of subjects) {
      await this.notifyAssignmentsChanged(subject);
    }
  }

  private toPermissionSet(input: CreatePermissionSetInput): PermissionSet {
    return {
      key: input.key,
      ...(input.title === undefined ? {} : { title: input.title }),
      grants: [...input.grants],
    };
  }

  private async resolvePermissionSets(input: {
    principal: Principal;
    subjects?: readonly AuthorizationSubject[];
  }): Promise<readonly PermissionSet[]> {
    const subjects = resolveAuthorizationSubjects(input);
    const assignments = await this.getStore().findAssignments(subjects);
    const keys = new Set(
      assignments.map((assignment) => assignment.permissionSet),
    );
    const requested = [...keys];
    const sets = await Promise.all(
      requested.map((key) => this.getStore().getPermissionSet(key)),
    );
    const missing = sets.findIndex((set) => set === undefined);
    if (missing >= 0) {
      throw new Error(`Unknown Permission Set: ${requested[missing]}`);
    }
    return sets as PermissionSet[];
  }

  private resourceMatches(
    configured: PermissionGrant['resource'],
    requested: PermissionGrant['resource'],
  ): boolean {
    return (
      configured.type === requested.type &&
      (configured.id === '*' || configured.id === requested.id)
    );
  }

  private createAssignmentId(input: AssignPermissionSetInput): string {
    return `${input.subject.type}:${input.subject.id}:${input.permissionSet}`;
  }
}

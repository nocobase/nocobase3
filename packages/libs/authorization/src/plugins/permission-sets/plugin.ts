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

export interface PermissionSetsApi {
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
  withConnection(connection: DatabaseConnection): PermissionSetsApi;
  getEffective(input: {
    principal: Principal;
    subjects?: readonly AuthorizationSubject[];
  }): Promise<readonly PermissionSet[]>;
  handler(input: PermissionSetHandlerInput): Promise<Response>;
}

export interface PermissionSetHandlerInput {
  request: Request;
  authorization: Pick<AuthorizationScope, 'require'>;
  basePath?: string;
}

export interface PermissionSetsOptions {
  /** Overrides the database-backed store, primarily for custom backends and tests. */
  store?: PermissionSetStore;
  onAssignmentsChanged?(subject: PermissionSetSubject): void | Promise<void>;
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

export interface PermissionSetsAuthorizationApi {
  permissionSets: PermissionSetsApi;
}

export type PermissionSetsPlugin =
  AuthorizationPlugin<PermissionSetsAuthorizationApi>;

export function permissionSets(
  options: PermissionSetsOptions = {},
): PermissionSetsPlugin {
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
        service.initialize(
          new DatabasePermissionSetStore(authz.connection),
          authz.connection,
        );
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

class PermissionSetService
  implements AuthorizationGrantService, PermissionSetsApi
{
  private store?: PermissionSetStore;
  private connection?: DatabaseConnection;
  readonly handler: (input: PermissionSetHandlerInput) => Promise<Response>;

  constructor(
    private readonly options: PermissionSetsOptions = {},
    connection?: DatabaseConnection,
  ) {
    this.store = options.store;
    this.connection = connection;
    this.handler = createPermissionSetHandler(this);
  }

  initialize(store: PermissionSetStore, connection?: DatabaseConnection): void {
    if (this.store) {
      throw new Error('Permission Sets store has already been initialized');
    }
    this.store = store;
    this.connection = connection;
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
    const sets = await this.getEffective(input);
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

  scope(identity: AuthorizationIdentity): AuthorizationGrantService {
    let resolved: Promise<readonly AuthorizationGrant[]> | undefined;
    const resolveAll = (): Promise<readonly AuthorizationGrant[]> => {
      resolved ??= this.resolveAll(identity);
      return resolved;
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
    };
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
    for (const assignment of existing) {
      if (!requestedSet.has(assignment.permissionSet)) {
        await this.getStore().revokeAssignment(assignment.id);
      }
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
    if (
      created.length > 0 ||
      existing.some((assignment) => !requestedSet.has(assignment.permissionSet))
    ) {
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

  withConnection(connection: DatabaseConnection): PermissionSetsApi {
    if (!this.connection && this.options.store) {
      throw new Error(
        'A custom Permission Set store cannot be rebound to a database transaction',
      );
    }
    return new PermissionSetService(
      {
        ...this.options,
        store: new DatabasePermissionSetStore(connection),
        // The caller that owns the transaction publishes after commit.
        onAssignmentsChanged: undefined,
      },
      connection,
    );
  }

  private getStore(): PermissionSetStore {
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

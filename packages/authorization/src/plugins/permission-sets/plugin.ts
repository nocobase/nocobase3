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
  const service = new PermissionSetService(options.store);
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
        resourceType: 'authorization.permission-sets',
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
                  message: `${grant.source.plugin}:${grant.source.id} allows Permission Set administration`,
                  plugin: 'permission-sets',
                })),
              }
            : {
                effect: 'deny',
                reasons: [
                  {
                    code: 'PERMISSION_SET_ADMINISTRATION_DENIED',
                    message: 'Permission Set administration is not allowed',
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
  readonly handler: (input: PermissionSetHandlerInput) => Promise<Response>;

  constructor(store?: PermissionSetStore) {
    this.store = store;
    this.handler = createPermissionSetHandler(this);
  }

  initialize(store: PermissionSetStore): void {
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
    return this.getStore().updatePermissionSet(
      key,
      this.toPermissionSet(input),
    );
  }

  async delete(key: string): Promise<void> {
    if (!(await this.getStore().getPermissionSet(key))) {
      throw new PermissionSetNotFoundError(key);
    }
    return this.getStore().deletePermissionSet(key);
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
    return this.getStore().assignPermissionSet({
      id: input.id ?? this.createAssignmentId(input),
      subject: input.subject,
      permissionSet: input.permissionSet,
    });
  }

  revoke(id: string): Promise<void> {
    return this.getStore().revokeAssignment(id);
  }

  listAssignments(
    permissionSet?: string,
  ): Promise<readonly PermissionSetAssignment[]> {
    return this.getStore().listAssignments(permissionSet);
  }

  private getStore(): PermissionSetStore {
    if (!this.store) {
      throw new Error('Permission Sets has not been initialized');
    }
    return this.store;
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

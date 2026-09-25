import type { DatabaseConnection } from '@nocobase/db';
import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

export interface Department {
  readonly id: string;
  readonly title: string;
  readonly parentId: string | null;
  readonly active: boolean;
  readonly sortOrder: number;
}

export interface DirectMember {
  readonly userId: string;
  readonly title: string;
  readonly description?: string;
  readonly primary: boolean;
}

/** One entry of a picker or member list, the shape the authorization workspace reads. */
export interface OrganizationOption {
  readonly id: string;
  readonly title: string;
  readonly description?: string;
}

export interface OrganizationPage {
  readonly items: readonly OrganizationOption[];
  readonly total: number;
}

export interface OrganizationPageQuery {
  readonly search?: string;
  readonly page: number;
  readonly pageSize: number;
}

export interface CreateDepartmentInput {
  readonly id?: string;
  readonly title: string;
  readonly parentId?: string | null;
  readonly sortOrder?: number;
}

export interface UpdateDepartmentInput {
  readonly title?: string;
  readonly parentId?: string | null;
  readonly sortOrder?: number;
}

export interface UpdateDepartmentResult {
  readonly department: Department;
  readonly changed: readonly string[];
}

export interface AddMemberInput {
  readonly departmentId: string;
  readonly userId: string;
  readonly primary?: boolean;
}

export type OrganizationErrorCode =
  | 'DEPARTMENT_NOT_FOUND'
  | 'DEPARTMENT_EXISTS'
  | 'PARENT_NOT_FOUND'
  | 'PARENT_CYCLE'
  | 'USER_NOT_FOUND'
  | 'MEMBER_NOT_FOUND'
  | 'INVALID_INPUT';

export class OrganizationError extends Error {
  public readonly code: OrganizationErrorCode;

  public constructor(code: OrganizationErrorCode, message: string) {
    super(message);
    this.name = 'OrganizationError';
    this.code = code;
  }
}

/**
 * The department organisation. Reads take an optional connection so they can run inside a caller's transaction;
 * each write runs in its own transaction and resolves, after commit, to the user ids whose membership changed.
 */
export interface OrganizationService {
  /** Every department, for the settings tree. */
  listTree(connection?: DatabaseConnection): Promise<readonly Department[]>;
  getDepartment(id: string): Promise<Department | undefined>;
  createDepartment(input: CreateDepartmentInput): Promise<Department>;
  updateDepartment(
    id: string,
    input: UpdateDepartmentInput,
  ): Promise<UpdateDepartmentResult>;
  /** The picker page: active departments only, literal title search, stable order. */
  listDepartments(query: OrganizationPageQuery): Promise<OrganizationPage>;
  /** Every requested id that exists; a disabled one says so in `description`. */
  resolveDepartments(
    ids: readonly string[],
  ): Promise<readonly OrganizationOption[]>;
  /** The department and its ancestors, nearest first; `undefined` when any is inactive or missing. */
  activeChain(
    departmentId: string,
    connection?: DatabaseConnection,
  ): Promise<readonly string[] | undefined>;
  /** The requested ids whose whole chain is active. */
  filterActive(
    ids: readonly string[],
    connection?: DatabaseConnection,
  ): Promise<readonly string[]>;
  /** Active direct departments of the user's active memberships, plus their ancestors. */
  departmentsOf(
    userId: string,
    connection?: DatabaseConnection,
  ): Promise<readonly string[]>;
  /** Enabled users in the department or any active descendant, one page. */
  effectiveMembers(
    departmentId: string,
    query: OrganizationPageQuery,
  ): Promise<OrganizationPage>;
  /** Active direct memberships of one department. */
  directMembers(departmentId: string): Promise<readonly DirectMember[]>;
  addMember(input: AddMemberInput): Promise<readonly string[]>;
  removeMember(
    departmentId: string,
    userId: string,
  ): Promise<readonly string[]>;
  setPrimary(departmentId: string, userId: string): Promise<readonly string[]>;
  setActive(departmentId: string, active: boolean): Promise<readonly string[]>;
}

export const organizationServiceToken: ServiceToken<OrganizationService> =
  createServiceToken<OrganizationService>(
    '@nocobase/app-plugin-departments-example/organization',
  );

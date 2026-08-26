import type {
  PermissionSet,
  PermissionSetAssignment,
  PermissionSetStore,
  PermissionSetSubject,
} from '../src/plugins/permission-sets/index.js';

export interface MockPermissionSetStoreOptions {
  permissionSets?: readonly PermissionSet[];
  assignments?: readonly PermissionSetAssignment[];
}

export class MockPermissionSetStore implements PermissionSetStore {
  private readonly permissionSets = new Map<string, PermissionSet>();
  private readonly assignments: PermissionSetAssignment[];
  findAssignmentsCalls = 0;
  getPermissionSetCalls = 0;

  constructor(options: MockPermissionSetStoreOptions = {}) {
    for (const permissionSet of options.permissionSets ?? []) {
      this.permissionSets.set(permissionSet.key, permissionSet);
    }
    this.assignments = [...(options.assignments ?? [])];
  }

  async listPermissionSets(): Promise<readonly PermissionSet[]> {
    return [...this.permissionSets.values()];
  }

  async findAssignments(
    subjects: readonly PermissionSetSubject[],
  ): Promise<readonly PermissionSetAssignment[]> {
    this.findAssignmentsCalls += 1;
    const subjectKeys = new Set(
      subjects.map((subject) => `${subject.type}:${subject.id}`),
    );
    return this.assignments.filter((assignment) =>
      subjectKeys.has(`${assignment.subject.type}:${assignment.subject.id}`),
    );
  }

  async getPermissionSet(key: string): Promise<PermissionSet | undefined> {
    this.getPermissionSetCalls += 1;
    return this.permissionSets.get(key);
  }

  async createPermissionSet(input: PermissionSet): Promise<PermissionSet> {
    if (this.permissionSets.has(input.key)) {
      throw new Error(`Permission Set already exists: ${input.key}`);
    }
    this.permissionSets.set(input.key, input);
    return input;
  }

  async updatePermissionSet(
    key: string,
    input: PermissionSet,
  ): Promise<PermissionSet> {
    if (!this.permissionSets.has(key)) {
      throw new Error(`Unknown Permission Set: ${key}`);
    }
    if (key !== input.key && this.permissionSets.has(input.key)) {
      throw new Error(`Permission Set already exists: ${input.key}`);
    }
    if (key !== input.key) {
      this.permissionSets.delete(key);
      for (let index = 0; index < this.assignments.length; index += 1) {
        const assignment = this.assignments[index];
        if (assignment?.permissionSet === key) {
          this.assignments[index] = { ...assignment, permissionSet: input.key };
        }
      }
    }
    this.permissionSets.set(input.key, input);
    return input;
  }

  async deletePermissionSet(key: string): Promise<void> {
    this.permissionSets.delete(key);
    for (let index = this.assignments.length - 1; index >= 0; index -= 1) {
      if (this.assignments[index]?.permissionSet === key) {
        this.assignments.splice(index, 1);
      }
    }
  }

  async assignPermissionSet(
    input: PermissionSetAssignment,
  ): Promise<PermissionSetAssignment> {
    if (this.assignments.some((assignment) => assignment.id === input.id)) {
      throw new Error(`Permission Set assignment already exists: ${input.id}`);
    }
    this.assignments.push(input);
    return input;
  }

  async revokeAssignment(id: string): Promise<void> {
    const index = this.assignments.findIndex(
      (assignment) => assignment.id === id,
    );
    if (index >= 0) this.assignments.splice(index, 1);
  }

  async listAssignments(
    permissionSet?: string,
  ): Promise<readonly PermissionSetAssignment[]> {
    return permissionSet === undefined
      ? [...this.assignments]
      : this.assignments.filter(
          (assignment) => assignment.permissionSet === permissionSet,
        );
  }
}

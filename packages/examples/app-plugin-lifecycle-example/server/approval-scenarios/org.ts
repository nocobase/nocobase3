/**
 * The organization the approval scenarios resolve people against. It is
 * deliberately mutable — people leave, managers change, delegations start and
 * end — because several scenarios are about what a change in the
 * organization does to requests already under way. A real application reads
 * these answers from its user, department and role tables.
 */
export interface Delegation {
  readonly from: string;
  readonly to: string;
  /** ISO instants; the delegation holds from `start` until before `end`. */
  readonly start: string;
  readonly end: string;
  /** Request kinds it covers; empty covers every kind. */
  readonly kinds: readonly string[];
  /** Whether it also covers decisions assigned before it started. */
  readonly coversExisting: boolean;
  readonly createdAt: string;
  revokedAt?: string;
}

export interface OrgSnapshot {
  readonly people: readonly string[];
  readonly managers?: Readonly<Record<string, string>>;
  readonly roles?: Readonly<Record<string, readonly string[]>>;
  readonly departments?: Readonly<Record<string, string>>;
  /** Who may submit on whose behalf: proxy → applicants. */
  readonly proxies?: Readonly<Record<string, readonly string[]>>;
}

export class OrgDirectory {
  private readonly active = new Set<string>();
  private readonly managers = new Map<string, string>();
  private readonly roles = new Map<string, Set<string>>();
  private readonly departments = new Map<string, string>();
  private readonly proxies = new Map<string, Set<string>>();
  private readonly delegations: Delegation[] = [];

  public constructor(snapshot: OrgSnapshot) {
    for (const person of snapshot.people) this.active.add(person);
    for (const [person, manager] of Object.entries(snapshot.managers ?? {}))
      this.managers.set(person, manager);
    for (const [role, holders] of Object.entries(snapshot.roles ?? {}))
      this.roles.set(role, new Set(holders));
    for (const [person, department] of Object.entries(
      snapshot.departments ?? {},
    ))
      this.departments.set(person, department);
    for (const [proxy, applicants] of Object.entries(snapshot.proxies ?? {}))
      this.proxies.set(proxy, new Set(applicants));
  }

  /** Whether the person may still act at all: not departed, not disabled. */
  public isActive(person: string): boolean {
    return this.active.has(person);
  }

  public deactivate(person: string): void {
    this.active.delete(person);
  }

  public managerOf(person: string): string | undefined {
    return this.managers.get(person);
  }

  public setManager(person: string, manager: string): void {
    this.managers.set(person, manager);
  }

  public departmentOf(person: string): string | undefined {
    return this.departments.get(person);
  }

  /** Every holder of a role, in the order they were added, active or not. */
  public holders(role: string): string[] {
    return [...(this.roles.get(role) ?? [])];
  }

  /** The first active holder of a role. */
  public holderOf(role: string): string | undefined {
    return this.holders(role).find((person) => this.isActive(person));
  }

  public hasRole(person: string, role: string): boolean {
    return this.roles.get(role)?.has(person) === true;
  }

  public grantRole(person: string, role: string): void {
    const holders = this.roles.get(role) ?? new Set<string>();
    holders.add(person);
    this.roles.set(role, holders);
  }

  public revokeRole(person: string, role: string): void {
    this.roles.get(role)?.delete(person);
  }

  public canProxyFor(proxy: string, applicant: string): boolean {
    return this.proxies.get(proxy)?.has(applicant) === true;
  }

  public delegate(delegation: Delegation): void {
    this.delegations.push(delegation);
  }

  public revokeDelegation(from: string, at: string): void {
    for (const delegation of this.delegations)
      if (delegation.from === from && delegation.revokedAt === undefined)
        delegation.revokedAt = at;
  }

  /**
   * Who has delegated some of their decisions to `delegate` at `at`: whose
   * work to look at for what the delegate may decide. `delegateOf` still
   * says whether a particular decision is covered.
   */
  public delegatorsOf(delegate: string, at: string): string[] {
    return [
      ...new Set(
        this.delegations
          .filter(
            (delegation) =>
              delegation.to === delegate &&
              delegation.revokedAt === undefined &&
              delegation.start <= at &&
              at < delegation.end,
          )
          .map((delegation) => delegation.from),
      ),
    ];
  }

  /**
   * Whom `principal` has delegated a decision of `kind` to at `at`. A
   * delegation is not passed on: a delegate's own delegation does not
   * reach the principal's work. `assignedAt` is when the principal took the
   * responsibility, so a delegation for new work only does not reach older
   * work.
   */
  public delegateOf(
    principal: string,
    kind: string,
    at: string,
    assignedAt: string,
  ): Delegation | undefined {
    return this.delegations.find(
      (delegation) =>
        delegation.from === principal &&
        delegation.revokedAt === undefined &&
        delegation.start <= at &&
        at < delegation.end &&
        (delegation.kinds.length === 0 || delegation.kinds.includes(kind)) &&
        (delegation.coversExisting || assignedAt >= delegation.start) &&
        this.isActive(delegation.to),
    );
  }
}

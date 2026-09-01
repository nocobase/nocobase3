export interface PermissionSelectOption {
  readonly value: string;
  readonly label: string;
  readonly description?: string;
}

export interface PermissionResourceOption extends PermissionSelectOption {
  readonly actions?: readonly PermissionSelectOption[];
}

export interface PermissionResourceTypeOption {
  readonly value: string;
  readonly label: string;
  readonly resources: readonly PermissionResourceOption[];
  readonly actions: readonly PermissionSelectOption[];
}

export interface PermissionResourceContribution {
  readonly plugin: string;
  readonly resourceType: PermissionResourceTypeOption;
}

/** Collects permission-editor metadata contributed by application plugins. */
export class PermissionResourceRegistry {
  private readonly contributions = new Map<
    string,
    PermissionResourceContribution
  >();

  public register(contribution: PermissionResourceContribution): void {
    const resourceType = contribution.resourceType.value;
    if (this.contributions.has(resourceType)) {
      throw new Error(
        `Permission resource type "${resourceType}" is already registered.`,
      );
    }
    this.contributions.set(resourceType, contribution);
  }

  public unregister(resourceType: string): void {
    this.contributions.delete(resourceType);
  }

  public list(): readonly PermissionResourceContribution[] {
    return [...this.contributions.values()];
  }
}

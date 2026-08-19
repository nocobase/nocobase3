import type { PolicyDefinition, ResourceDefinition } from './types.js';

class Registry<T extends { key: string }> {
  private readonly items = new Map<string, T>();

  register(item: T): void {
    if (this.items.has(item.key)) {
      throw new Error(`Duplicate registration: ${item.key}`);
    }
    this.items.set(item.key, item);
  }

  get(key: string): T | undefined {
    return this.items.get(key);
  }

  list(): T[] {
    return [...this.items.values()];
  }
}

export class ResourceRegistry {
  private readonly registry = new Registry<ResourceDefinition & { key: string }>();

  register(resource: ResourceDefinition): void {
    if (new Set(resource.actions).size !== resource.actions.length) {
      throw new Error(`Resource "${resource.name}" has duplicate actions`);
    }
    for (const [name, field] of Object.entries(resource.fields)) {
      if (!name) {
        throw new Error(`Resource "${resource.name}" has an empty field name`);
      }
      if (field.type === 'relation' && (!field.target || !['one', 'many'].includes(field.cardinality))) {
        throw new Error(`Resource "${resource.name}" has an invalid relation field "${name}"`);
      }
    }
    this.registry.register({ ...resource, key: resource.name });
  }

  get(name: string): ResourceDefinition | undefined {
    return this.registry.get(name);
  }

  list(): ResourceDefinition[] {
    return this.registry.list();
  }
}

export class PolicyRegistry {
  private readonly registry = new Registry<PolicyDefinition>();

  register(policy: PolicyDefinition): void {
    this.registry.register(policy);
  }

  get(key: string): PolicyDefinition | undefined {
    return this.registry.get(key);
  }

  list(): PolicyDefinition[] {
    return this.registry.list();
  }
}

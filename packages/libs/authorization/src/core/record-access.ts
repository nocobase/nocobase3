import type { Principal, ResourceRef } from './types.js';
import type { ResourceTitle } from './registry.js';

export interface RecordAccessContext<P = unknown> {
  principal: Principal;
  resource: ResourceRef;
  action: string;
  params: P;
}

/** Resource adapters own the result type and its validation. */
export interface RecordAccessPolicy<P = unknown, Result = unknown> {
  readonly key: string;
  readonly resources: readonly ResourceRef[];
  readonly title?: ResourceTitle;
  readonly description?: ResourceTitle;
  readonly paramsSchema?: unknown;
  resolve(
    this: void,
    context: RecordAccessContext<P>,
  ): Result | Promise<Result>;
}

export class RecordAccessRegistry {
  private readonly entries = new Map<string, RecordAccessPolicy>();
  add<P, R>(policy: RecordAccessPolicy<P, R>): void {
    if (!policy.key || this.entries.has(policy.key))
      throw new TypeError('Duplicate or empty record access key');
    if (typeof policy.resolve !== 'function')
      throw new TypeError('Record access requires a resolver');
    if (
      !policy.resources.length ||
      policy.resources.some((r) => !r.type || !r.id)
    )
      throw new TypeError('Record access requires valid resources');
    const { resolve, ...metadata } = policy;
    this.entries.set(policy.key, {
      ...structuredClone(metadata),
      resolve,
    });
  }
  get(key: string): RecordAccessPolicy | undefined {
    const policy = this.entries.get(key);
    if (!policy) return;
    const { resolve, ...metadata } = policy;
    return { ...structuredClone(metadata), resolve };
  }
  list(): readonly RecordAccessPolicy[] {
    return [...this.entries.keys()].map((key) => this.get(key)!);
  }
  listFor(resource: ResourceRef): readonly RecordAccessPolicy[] {
    return this.list().filter((policy) =>
      policy.resources.some(
        (r) =>
          r.type === resource.type && (r.id === '*' || r.id === resource.id),
      ),
    );
  }
  async resolve(key: string, context: RecordAccessContext): Promise<unknown> {
    const policy = this.entries.get(key);
    if (
      !policy ||
      !policy.resources.some(
        (resource) =>
          resource.type === context.resource.type &&
          (resource.id === '*' || resource.id === context.resource.id),
      )
    )
      throw new TypeError(
        `Unknown or inapplicable record access policy: ${key}`,
      );
    return policy.resolve(context);
  }
}

export class RecordAccessBuilder<K extends string, P = unknown> {
  constructor(
    private readonly definition: Omit<RecordAccessPolicy<P>, 'resolve'> & {
      key: K;
    },
  ) {
    this.definition = structuredClone(definition);
  }
  title(title: ResourceTitle): RecordAccessBuilder<K, P> {
    return new RecordAccessBuilder({ ...this.definition, title });
  }
  description(description: ResourceTitle): RecordAccessBuilder<K, P> {
    return new RecordAccessBuilder({ ...this.definition, description });
  }
  resources(...resources: ResourceRef[]): RecordAccessBuilder<K, P> {
    return new RecordAccessBuilder({ ...this.definition, resources });
  }
  params<T>(paramsSchema: unknown): RecordAccessBuilder<K, T> {
    return new RecordAccessBuilder({ ...this.definition, paramsSchema });
  }
  resolve<R>(
    resolve: (context: RecordAccessContext<P>) => R,
  ): RecordAccessPolicy<P, Awaited<R>> & { readonly key: K } {
    if (!this.definition.resources.length)
      throw new TypeError('Record access requires resources');
    return {
      ...structuredClone(this.definition),
      resolve: resolve as RecordAccessPolicy<P, Awaited<R>>['resolve'],
    };
  }
}

export function defineRecordAccess<const K extends string, P, R>(
  key: K,
  configure: (
    access: RecordAccessBuilder<K>,
  ) => RecordAccessPolicy<P, R> & { readonly key: K },
): RecordAccessPolicy<P, R> & { readonly key: K } {
  if (!key) throw new TypeError('A record access key is required');
  return configure(new RecordAccessBuilder({ key, resources: [] }));
}

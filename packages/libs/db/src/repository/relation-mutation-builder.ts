import type {
  ConnectTarget,
  CreateTarget,
  NestedCreateOptions,
  RelationMutationAst,
  RelationMutationBuilder,
  RelationMutationInput,
  RelationMutationNode,
  RelationPatchMutationBuilder,
  RelationReplaceMutationBuilder,
  RelationTargetMutationBuilder,
  UniqueSelector,
} from './types.js';

export class DefaultRelationMutationBuilder implements RelationMutationBuilder {
  private readonly items: RelationMutationNode[] = [];

  constructor(private readonly collection?: string) {}

  set(
    field: string,
    target: (
      builder: RelationTargetMutationBuilder,
    ) => RelationTargetMutationBuilder,
  ): this {
    const builder = new DefaultRelationTargetMutationBuilder();
    target(builder);
    const targets = builder.targets();
    if (targets.length !== 1) {
      throw new TypeError('Relation set() requires exactly one target.');
    }
    this.items.push({
      kind: 'relation',
      field,
      action: 'set',
      target: targets[0],
    });
    return this;
  }

  clear(field: string): this {
    this.items.push({ kind: 'relation', field, action: 'clear' });
    return this;
  }

  patch(
    field: string,
    targets: (
      builder: RelationPatchMutationBuilder,
    ) => RelationPatchMutationBuilder,
  ): this {
    const builder = new DefaultRelationPatchMutationBuilder();
    targets(builder);
    this.items.push({
      kind: 'relation',
      field,
      action: 'patch',
      connect: builder.connectTargets(),
      create: builder.createTargets(),
      disconnect: builder.disconnectTargets(),
    });
    return this;
  }

  replace(
    field: string,
    targets: (
      builder: RelationReplaceMutationBuilder,
    ) => RelationReplaceMutationBuilder,
  ): this {
    const builder = new DefaultRelationTargetMutationBuilder();
    targets(builder);
    this.items.push({
      kind: 'relation',
      field,
      action: 'replace',
      targets: builder.targets(),
    });
    return this;
  }

  toAst(): RelationMutationAst {
    return {
      kind: 'relationMutation',
      version: 1,
      collection: this.collection,
      items: [...this.items],
    };
  }
}

class DefaultRelationTargetMutationBuilder implements RelationTargetMutationBuilder {
  protected readonly values: Array<ConnectTarget | CreateTarget> = [];

  connect(values: Readonly<Record<string, unknown>>): this {
    return this.connectBy(Object.keys(values), values);
  }

  connectBy(
    fields: readonly string[],
    values: Readonly<Record<string, unknown>>,
  ): this {
    this.values.push({
      kind: 'connect',
      by: selector(fields, values),
    });
    return this;
  }

  create(
    values: Readonly<Record<string, unknown>>,
    options: NestedCreateOptions = {},
  ): this {
    this.values.push({
      kind: 'create',
      values,
      clientKey: options.clientKey,
      relations: normalizeNestedInput(options.relations),
    });
    return this;
  }

  targets(): Array<ConnectTarget | CreateTarget> {
    return [...this.values];
  }

  connectTargets(): ConnectTarget[] {
    return this.values.filter(
      (target): target is ConnectTarget => target.kind === 'connect',
    );
  }

  createTargets(): CreateTarget[] {
    return this.values.filter(
      (target): target is CreateTarget => target.kind === 'create',
    );
  }
}

class DefaultRelationPatchMutationBuilder
  extends DefaultRelationTargetMutationBuilder
  implements RelationPatchMutationBuilder
{
  private readonly disconnected: UniqueSelector[] = [];

  disconnect(values: Readonly<Record<string, unknown>>): this {
    return this.disconnectBy(Object.keys(values), values);
  }

  disconnectBy(
    fields: readonly string[],
    values: Readonly<Record<string, unknown>>,
  ): this {
    this.disconnected.push(selector(fields, values));
    return this;
  }

  disconnectTargets(): UniqueSelector[] {
    return [...this.disconnected];
  }
}

function selector(
  fields: readonly string[],
  values: Readonly<Record<string, unknown>>,
): UniqueSelector {
  return { kind: 'unique', fields: [...fields], values: { ...values } };
}

function normalizeNestedInput(
  input: RelationMutationInput | undefined,
): RelationMutationAst | undefined {
  if (!input) return undefined;
  return typeof input === 'function'
    ? input(new DefaultRelationMutationBuilder()).toAst()
    : input;
}

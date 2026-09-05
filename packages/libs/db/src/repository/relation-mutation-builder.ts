import type {
  CreateTarget,
  NestedCreateOptions,
  RelationDeleteInput,
  RelationTargetSelector,
  RelationUpdateInput,
  RelationUpsertInput,
  UpdateRelationFieldMutationBuilder,
} from './types.js';

export interface RelationFieldMutationBuilderState {
  readonly create: readonly CreateTarget[];
  readonly connect: readonly RelationTargetSelector[];
  readonly disconnect: true | readonly RelationTargetSelector[] | undefined;
  readonly set: readonly RelationTargetSelector[] | undefined;
  readonly update: readonly RelationUpdateInput[];
  readonly upsert: readonly RelationUpsertInput[];
  readonly delete: readonly RelationDeleteInput[];
}

export class DefaultRelationFieldMutationBuilder implements UpdateRelationFieldMutationBuilder {
  private readonly created: CreateTarget[] = [];
  private readonly connected: RelationTargetSelector[] = [];
  private readonly disconnected: RelationTargetSelector[] = [];
  private clear = false;
  private replacement: readonly RelationTargetSelector[] | undefined;
  private readonly updates: RelationUpdateInput[] = [];
  private readonly upserts: RelationUpsertInput[] = [];
  private readonly deletes: RelationDeleteInput[] = [];

  create(
    values: Readonly<Record<string, unknown>>,
    options: NestedCreateOptions = {},
  ): this {
    this.created.push({
      kind: 'create',
      values,
      clientKey: options.clientKey,
    });
    return this;
  }

  connect(values: RelationTargetSelector): this {
    this.connected.push(values);
    return this;
  }

  disconnect(values?: RelationTargetSelector): this {
    if (values === undefined) this.clear = true;
    else this.disconnected.push(values);
    return this;
  }

  set(values: readonly RelationTargetSelector[]): this {
    this.replacement = [...values];
    return this;
  }

  update(input: RelationUpdateInput): this {
    this.updates.push(input);
    return this;
  }

  upsert(input: RelationUpsertInput): this {
    this.upserts.push(input);
    return this;
  }

  delete(input: RelationDeleteInput = {}): this {
    this.deletes.push(input);
    return this;
  }

  toState(): RelationFieldMutationBuilderState {
    return {
      create: [...this.created],
      connect: [...this.connected],
      disconnect: this.clear
        ? true
        : this.disconnected.length > 0
          ? [...this.disconnected]
          : undefined,
      set: this.replacement,
      update: [...this.updates],
      upsert: [...this.upserts],
      delete: [...this.deletes],
    };
  }
}

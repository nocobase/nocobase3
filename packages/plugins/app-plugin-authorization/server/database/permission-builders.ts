import type {
  PermissionFields,
  PermissionRecordAccess,
  ReadPermission,
  RelationShapePermission,
  RelationWritePermission,
  ThroughPermission,
  WritePermission,
} from './permissions.js';

type FieldName<Row> = keyof Row & string;
type Configure<T> = (builder: T) => T;
type Reference = PermissionRecordAccess;

/** Detached immutable builders; callbacks return the next value explicitly. */
export class ReadPermissionBuilder<Row = Record<string, unknown>> {
  constructor(private readonly value: ReadPermission = {}) {
    this.value = structuredClone(value);
  }
  fields(...fields: FieldName<Row>[]): ReadPermissionBuilder<Row> {
    return new ReadPermissionBuilder({ ...this.value, fields });
  }
  allFields(): ReadPermissionBuilder<Row> {
    return new ReadPermissionBuilder({ ...this.value, fields: '*' });
  }
  recordAccess(...rules: Reference[]): ReadPermissionBuilder<Row> {
    return new ReadPermissionBuilder({
      ...this.value,
      recordAccess: rules.map((rule) =>
        typeof rule === 'string'
          ? rule
          : {
              key: rule.key,
              ...(rule.params === undefined ? {} : { params: rule.params }),
            },
      ),
    });
  }
  relation<T = Record<string, unknown>>(
    name: string,
    configure: Configure<ReadPermissionBuilder<T>>,
  ): ReadPermissionBuilder<Row> {
    const relations = this.value.relations || {};
    if (Object.hasOwn(relations, name))
      throw new TypeError(`Duplicate relation: ${name}`);
    return new ReadPermissionBuilder({
      ...this.value,
      relations: {
        ...relations,
        [name]: configure(new ReadPermissionBuilder<T>()).build(),
      },
    });
  }
  build(): ReadPermission {
    return structuredClone(this.value);
  }
}

export class ThroughPermissionBuilder {
  constructor(private readonly value: ThroughPermission = {}) {
    this.value = structuredClone(value);
  }
  through(
    configure: Configure<PermissionFieldsBuilder>,
  ): ThroughPermissionBuilder {
    return new ThroughPermissionBuilder({
      through: configure(new PermissionFieldsBuilder()).build(),
    });
  }
  build(): ThroughPermission {
    return structuredClone(this.value);
  }
}

export class PermissionFieldsBuilder<Row = Record<string, unknown>> {
  constructor(private readonly value: { fields?: PermissionFields } = {}) {
    this.value = structuredClone(value);
  }
  fields(...fields: FieldName<Row>[]): PermissionFieldsBuilder<Row> {
    return new PermissionFieldsBuilder({ fields });
  }
  allFields(): PermissionFieldsBuilder<Row> {
    return new PermissionFieldsBuilder({ fields: '*' });
  }
  build(): { fields?: PermissionFields } {
    return structuredClone(this.value);
  }
}

export type RelationPermissionConfigurator<C extends boolean> = Configure<
  RelationPermissionBuilder<C>
>;

export class WritePermissionBuilder<
  Row = Record<string, unknown>,
  C extends boolean = false,
  E extends boolean = false,
  N extends boolean = false,
> {
  constructor(
    private readonly value: WritePermission & ThroughPermission = {},
    private readonly createOnly: C = false as C,
    private readonly allowThrough: E = false as E,
    private readonly nested: N = false as N,
  ) {
    this.value = structuredClone(value);
  }
  fields(...fields: FieldName<Row>[]): WritePermissionBuilder<Row, C, E, N> {
    return new WritePermissionBuilder(
      { ...this.value, fields },
      this.createOnly,
      this.allowThrough,
      this.nested,
    );
  }
  allFields(): WritePermissionBuilder<Row, C, E, N> {
    return new WritePermissionBuilder(
      { ...this.value, fields: '*' },
      this.createOnly,
      this.allowThrough,
      this.nested,
    );
  }
  recordAccess(
    this: WritePermissionBuilder<Row, C, E, false>,
    ...rules: Reference[]
  ): WritePermissionBuilder<Row, C, E, false> {
    return new WritePermissionBuilder(
      {
        ...this.value,
        recordAccess: rules.map((rule) =>
          typeof rule === 'string'
            ? rule
            : {
                key: rule.key,
                ...(rule.params === undefined ? {} : { params: rule.params }),
              },
        ),
      },
      this.createOnly,
      this.allowThrough,
      this.nested,
    );
  }
  relation(
    name: string,
    configure: RelationPermissionConfigurator<C>,
  ): WritePermissionBuilder<Row, C, E, N> {
    const relations = this.value.relations || {};
    if (Object.hasOwn(relations, name))
      throw new TypeError(`Duplicate relation: ${name}`);
    const builder = new RelationPermissionBuilder(this.createOnly);
    const result = configure(builder);
    return new WritePermissionBuilder(
      { ...this.value, relations: { ...relations, [name]: result.build() } },
      this.createOnly,
      this.allowThrough,
      this.nested,
    );
  }
  through(
    this: WritePermissionBuilder<Row, C, true, N>,
    configure: Configure<PermissionFieldsBuilder>,
  ): WritePermissionBuilder<Row, C, true, N> {
    return new WritePermissionBuilder(
      {
        ...this.value,
        through: configure(new PermissionFieldsBuilder()).build(),
      },
      this.createOnly,
      this.allowThrough,
      this.nested,
    );
  }
  build(): WritePermission & ThroughPermission {
    return structuredClone(this.value);
  }
}

export class RelationPermissionBuilder<C extends boolean = false> {
  constructor(
    private readonly createOnly: C = false as C,
    private readonly value: RelationWritePermission = {},
  ) {
    this.value = structuredClone(value);
  }
  recordAccess(...rules: Reference[]): RelationPermissionBuilder<C> {
    return new RelationPermissionBuilder(this.createOnly, {
      ...this.value,
      recordAccess: rules.map((rule) =>
        typeof rule === 'string'
          ? rule
          : {
              key: rule.key,
              ...(rule.params === undefined ? {} : { params: rule.params }),
            },
      ),
    });
  }
  private operation(
    key: keyof RelationWritePermission,
    value: object,
  ): RelationPermissionBuilder<C> {
    if (this.createOnly && !['create', 'connect'].includes(key))
      throw new TypeError(
        `Relation operation ${key} is unavailable beneath create`,
      );
    if (Object.hasOwn(this.value, key))
      throw new TypeError(`Duplicate relation operation: ${key}`);
    return new RelationPermissionBuilder(this.createOnly, {
      ...this.value,
      [key]: value,
    });
  }
  create<T = Record<string, unknown>>(
    configure: Configure<WritePermissionBuilder<T, C, true, true>>,
  ): RelationPermissionBuilder<C> {
    return this.operation(
      'create',
      configure(
        new WritePermissionBuilder<T, C, true, true>(
          {},
          this.createOnly,
          true,
          true,
        ),
      ).build(),
    );
  }
  update<T = Record<string, unknown>>(
    this: RelationPermissionBuilder<false>,
    configure: Configure<WritePermissionBuilder<T, false, false, true>>,
  ): RelationPermissionBuilder<false> {
    return this.operation(
      'update',
      configure(
        new WritePermissionBuilder<T, false, false, true>(
          {},
          false,
          false,
          true,
        ),
      ).build(),
    );
  }
  upsert(
    this: RelationPermissionBuilder<false>,
    configure: Configure<PermissionUpsertBuilder>,
  ): RelationPermissionBuilder<false> {
    return this.operation(
      'upsert',
      configure(new PermissionUpsertBuilder()).build(),
    );
  }
  connect(
    configure?: Configure<ThroughPermissionBuilder>,
  ): RelationPermissionBuilder<C> {
    return this.operation(
      'connect',
      configure ? configure(new ThroughPermissionBuilder()).build() : {},
    );
  }
  set(
    this: RelationPermissionBuilder<false>,
    configure?: Configure<ThroughPermissionBuilder>,
  ): RelationPermissionBuilder<false> {
    return this.operation(
      'set',
      configure ? configure(new ThroughPermissionBuilder()).build() : {},
    );
  }
  disconnect(
    this: RelationPermissionBuilder<false>,
  ): RelationPermissionBuilder<false> {
    return this.operation('disconnect', {});
  }
  delete(
    this: RelationPermissionBuilder<false>,
  ): RelationPermissionBuilder<false> {
    return this.operation('delete', {});
  }
  build(): RelationWritePermission {
    return structuredClone(this.value);
  }
}

export class PermissionUpsertBuilder {
  constructor(
    private readonly value: {
      create?: RelationShapePermission;
      update?: RelationShapePermission;
    } = {},
  ) {
    this.value = structuredClone(value);
  }
  create<T = Record<string, unknown>>(
    configure: Configure<WritePermissionBuilder<T, false, false, true>>,
  ): PermissionUpsertBuilder {
    return new PermissionUpsertBuilder({
      ...this.value,
      create: configure(
        new WritePermissionBuilder<T, false, false, true>(
          {},
          false,
          false,
          true,
        ),
      ).build(),
    });
  }
  update<T = Record<string, unknown>>(
    configure: Configure<WritePermissionBuilder<T, false, false, true>>,
  ): PermissionUpsertBuilder {
    return new PermissionUpsertBuilder({
      ...this.value,
      update: configure(
        new WritePermissionBuilder<T, false, false, true>(
          {},
          false,
          false,
          true,
        ),
      ).build(),
    });
  }
  build(): NonNullable<RelationWritePermission['upsert']> {
    if (!this.value.create || !this.value.update)
      throw new TypeError('Upsert requires create and update permissions');
    return structuredClone({
      create: this.value.create,
      update: this.value.update,
    });
  }
}

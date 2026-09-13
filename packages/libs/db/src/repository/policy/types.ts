import type {
  FilterAst,
  FilterBuilder,
  FilterNode,
  FilterShorthand,
  RepositoryRecord,
} from '@nocobase/repository-input';

export type PolicyScalarValue = string | number | boolean | null | Date;

export type PolicyScope<TRecord extends object = RepositoryRecord> =
  | FilterShorthand<TRecord>
  | FilterAst
  | ((filter: FilterBuilder<TRecord>) => FilterNode);

export interface PolicyRef {
  readonly kind: 'policyRef';
  readonly target: string;
}

export interface ReadNode<TRecord extends object = RepositoryRecord> {
  readonly scope: true | PolicyScope<TRecord>;
  readonly fields?: false | readonly string[];
  readonly relations?: false | Readonly<Record<string, ReadNode | PolicyRef>>;
}

export interface RelationShapeNode {
  readonly fields?: false | readonly string[];
  readonly relations?: false | Readonly<Record<string, RelationWriteNode>>;
}

export interface ThroughNode {
  readonly through?: false | { readonly fields?: false | readonly string[] };
}

export interface RelationCreateNode extends RelationShapeNode, ThroughNode {}

export interface RelationWriteNode<TRecord extends object = RepositoryRecord> {
  readonly scope?: true | PolicyScope<TRecord>;
  readonly create?: RelationCreateNode;
  readonly update?: RelationShapeNode;
  readonly upsert?: {
    readonly create: RelationShapeNode;
    readonly update: RelationShapeNode;
  };
  readonly connect?: ThroughNode;
  readonly disconnect?: Readonly<Record<string, never>>;
  readonly set?: ThroughNode;
  readonly delete?: Readonly<Record<string, never>>;
}

export interface WriteNode<TRecord extends object = RepositoryRecord> {
  readonly scope: true | PolicyScope<TRecord>;
  readonly fields?: false | readonly string[];
  readonly relations?:
    false | Readonly<Record<string, RelationWriteNode<TRecord>>>;
}

export interface CreateNode<
  TRecord extends object = RepositoryRecord,
> extends WriteNode<TRecord> {
  readonly defaults?: Readonly<Record<string, PolicyScalarValue>>;
}

export interface DeleteNode<TRecord extends object = RepositoryRecord> {
  readonly scope: true | PolicyScope<TRecord>;
}

export interface RepositoryPolicy<TRecord extends object = RepositoryRecord> {
  readonly read: true | false | ReadNode<TRecord>;
  readonly create: true | false | CreateNode<TRecord>;
  readonly update: true | false | WriteNode<TRecord>;
  readonly delete: true | false | DeleteNode<TRecord>;
}

export type PartialRepositoryPolicy<TRecord extends object = RepositoryRecord> =
  {
    readonly [K in keyof RepositoryPolicy<TRecord>]?:
      | true
      | false
      | Partial<NonNullable<Extract<RepositoryPolicy<TRecord>[K], object>>>;
  };

export interface NormalizedReadNode {
  readonly scope: true | FilterAst;
  readonly fields: readonly string[];
  readonly relations: Readonly<Record<string, NormalizedReadNode | PolicyRef>>;
}

export interface NormalizedRelationWriteNode {
  readonly scope?: true | FilterAst;
  readonly create?: NormalizedRelationShapeNode;
  readonly update?: NormalizedRelationShapeNode;
  readonly upsert?: {
    readonly create: NormalizedRelationShapeNode;
    readonly update: NormalizedRelationShapeNode;
  };
  readonly connect?: NormalizedThroughNode;
  readonly disconnect?: Readonly<Record<string, never>>;
  readonly set?: NormalizedThroughNode;
  readonly delete?: Readonly<Record<string, never>>;
}

export interface NormalizedRelationShapeNode {
  readonly fields: readonly string[];
  readonly relations: Readonly<Record<string, NormalizedRelationWriteNode>>;
  readonly through?: false | { readonly fields: readonly string[] };
}

export interface NormalizedThroughNode {
  readonly through: false | { readonly fields: readonly string[] };
}

export interface NormalizedWriteNode {
  readonly scope: true | FilterAst;
  readonly fields: readonly string[];
  readonly relations: Readonly<Record<string, NormalizedRelationWriteNode>>;
}

export interface NormalizedCreateNode extends NormalizedWriteNode {
  readonly defaults: Readonly<Record<string, PolicyScalarValue>>;
}

export interface NormalizedDeleteNode {
  readonly scope: true | FilterAst;
}

export interface NormalizedRepositoryPolicy {
  readonly read: true | false | NormalizedReadNode;
  readonly create: true | false | NormalizedCreateNode;
  readonly update: true | false | NormalizedWriteNode;
  readonly delete: true | false | NormalizedDeleteNode;
}

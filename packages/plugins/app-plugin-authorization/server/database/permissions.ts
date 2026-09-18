/** Permission declarations intentionally own their types instead of importing DB Policy. */
export type PermissionFields = '*' | readonly string[];
export type PermissionRecordAccess =
  string | { readonly key: string; readonly params?: unknown };

export interface ReadPermission {
  readonly recordAccess?: readonly PermissionRecordAccess[];
  readonly fields?: PermissionFields;
  readonly relations?: false | Readonly<Record<string, ReadPermission>>;
}

export interface RelationShapePermission {
  readonly fields?: PermissionFields;
  readonly relations?:
    false | Readonly<Record<string, RelationWritePermission>>;
}

export interface ThroughPermission {
  readonly through?: false | { readonly fields?: PermissionFields };
}

export interface RelationWritePermission {
  readonly recordAccess?: readonly PermissionRecordAccess[];
  readonly create?: RelationShapePermission & ThroughPermission;
  readonly update?: RelationShapePermission;
  readonly upsert?: {
    readonly create: RelationShapePermission;
    readonly update: RelationShapePermission;
  };
  readonly connect?: ThroughPermission;
  readonly disconnect?: Readonly<Record<string, never>>;
  readonly set?: ThroughPermission;
  readonly delete?: Readonly<Record<string, never>>;
}

export interface WritePermission extends RelationShapePermission {
  readonly recordAccess?: readonly PermissionRecordAccess[];
}

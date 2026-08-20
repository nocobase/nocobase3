/** A trusted, request-scoped identity. It is not an authentication table. */
export interface Principal {
  id: string;
  attributes?: Readonly<Record<string, unknown>>;
}

export type AssignmentSubjectType = 'user'
  | 'group'
  | 'team'
  | 'department'
  | 'allAuthenticatedUsers';

export interface AssignmentSubject {
  type: AssignmentSubjectType;
  id: string;
}

export type FilterScalar = string | number | boolean | null;

export interface FilterVariable {
  kind: 'variable';
  path: string;
}

export type FilterValue = FilterScalar
  | FilterVariable
  | readonly (FilterScalar | FilterVariable)[];

export type FilterOperator =
  | '$includes' | '$notIncludes'
  | '$eq' | '$ne' | '$neq'
  | '$gt' | '$gte' | '$lt' | '$lte'
  | '$empty' | '$notEmpty'
  | '$dateOn' | '$dateNotOn' | '$dateBefore' | '$dateAfter'
  | '$dateNotBefore' | '$dateNotAfter' | '$dateBetween'
  | '$in' | '$notIn'
  | '$match' | '$notMatch'
  | '$anyOf' | '$noneOf'
  | '$isTruly' | '$isFalsy'
  | '$exists' | '$notExists'
  | '$childIn' | '$childNotIn';

export interface FilterConditionNode {
  kind: 'condition';
  path: readonly string[];
  operator: FilterOperator;
  value?: FilterValue;
}

export interface FilterGroupNode {
  kind: 'group';
  logic: 'and' | 'or';
  items: FilterNode[];
}

export interface FilterRelationNode {
  kind: 'relation';
  path: readonly string[];
  quantifier: 'exists' | 'notExists' | 'some' | 'none' | 'empty' | 'notEmpty';
  filter?: FilterGroupNode;
}

/** Tests whether a field belongs to a value set selected from another logical Collection. */
export interface FilterMembershipNode {
  kind: 'membership';
  path: readonly string[];
  source: {
    collection: string;
    field: string;
    where: Readonly<Record<string, FilterScalar>>;
  };
}

export type FilterNode = FilterConditionNode | FilterGroupNode | FilterRelationNode | FilterMembershipNode;

export interface FilterAst {
  kind: 'filter';
  version: 1;
  collection?: string;
  root: FilterGroupNode;
}

export interface ScalarResourceField {
  type: 'scalar';
}

export interface RelationResourceField {
  type: 'relation';
  target: string;
  cardinality: 'one' | 'many';
}

export type ResourceField = ScalarResourceField | RelationResourceField;

export interface ResourceDefinition {
  name: string;
  actions: readonly string[];
  fields: Readonly<Record<string, ResourceField>>;
  attributes?: Readonly<Record<string, string>>;
}

export interface RecordScope {
  policy: string;
  params?: unknown;
}

export interface ActionPermission {
  action: string;
  inputFields?: '*' | readonly string[];
  outputFields?: '*' | readonly string[];
  /** Record scope directly granted by this Permission Set for the Action. */
  recordScope?: readonly RecordScope[];
}

export type RelationAction = 'traverse' | 'connect' | 'disconnect';

export interface ObjectPermission {
  resource: string;
  actions: readonly ActionPermission[];
}

export interface PermissionSet {
  id?: string;
  key: string;
  title?: string;
  permissions: readonly ObjectPermission[];
}

export interface PermissionSetGroup {
  id?: string;
  key: string;
  title?: string;
  permissionSets: readonly string[];
}

export interface Assignment {
  id: string;
  subject: AssignmentSubject;
  target: { type: 'permissionSet' | 'permissionSetGroup'; key: string };
  startsAt?: Date;
  expiresAt?: Date;
}

export type OrganizationWideAccess = 'private' | 'publicReadOnly' | 'publicReadWrite';

export interface OrganizationWideDefault {
  access: OrganizationWideAccess;
}

/** A normalized explicit-record share entry. The database uses one row per record. */
export interface SharingRuleRecord {
  id?: string;
  sharingRuleId: string;
  recordId: string;
  createdAt?: Date;
}

export interface SharingRule {
  id?: string;
  key: string;
  title?: string;
  resource: string;
  actions: readonly string[];
  subjects: readonly AssignmentSubject[];
  records:
    | { type: 'criteria'; scopes: readonly RecordScope[] }
    | { type: 'records'; ids: readonly string[] };
  startsAt?: Date;
  expiresAt?: Date;
  reason?: string;
}

export interface RestrictionRule {
  id?: string;
  key: string;
  title?: string;
  resource: string;
  actions: readonly string[];
  subjects: readonly AssignmentSubject[];
  scopes: readonly RecordScope[];
}

export interface PolicyCompileContext<P = unknown> {
  principal: Principal;
  resource: ResourceDefinition;
  action: string;
  params: P;
}

export interface PolicyDefinition<P = unknown> {
  key: string;
  title?: string;
  description?: string;
  paramsSchema?: unknown;
  appliesTo: readonly ('recordScope' | 'sharingRule' | 'restrictionRule')[];
  compile(context: PolicyCompileContext<P>): FilterAst | Promise<FilterAst>;
}

export interface AuthorizationFieldRequest {
  input?: readonly string[];
  output?: readonly string[];
  filter?: readonly string[];
  sort?: readonly string[];
  group?: readonly string[];
}

export interface AuthorizationRequest {
  resource: string;
  action: string;
  fields?: AuthorizationFieldRequest;
  record?: Readonly<Record<string, unknown>>;
  now?: Date;
}

export interface RelationAuthorizationRequest {
  resource: string;
  field: string;
  action: RelationAction;
  targetFields?: AuthorizationFieldRequest;
  sourceRecord?: Readonly<Record<string, unknown>>;
  targetRecord?: Readonly<Record<string, unknown>>;
  now?: Date;
}

export interface AuthorizationReason {
  type: 'permissionSet' | 'recordAccess' | 'organizationWideDefault' | 'ownerAccess' | 'sharingRule' | 'restrictionRule' | 'fieldSecurity' | 'error';
  key: string;
  message: string;
}

export interface AuthorizationPlan {
  allowed: boolean;
  filter?: FilterAst;
  fields?: {
    input?: '*' | string[];
    output?: '*' | string[];
  };
  reasons: AuthorizationReason[];
}

export interface RelationAuthorizationPlan {
  allowed: boolean;
  sourceFilter?: FilterAst;
  targetFilter?: FilterAst;
  reasons: AuthorizationReason[];
}

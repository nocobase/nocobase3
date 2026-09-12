export interface Principal {
  type: string;
  id: string;
  attributes?: Readonly<Record<string, unknown>>;
}

export interface AuthorizationSubject {
  type: string;
  id: string;
}

export interface AuthorizationIdentity {
  principal: Principal;
  subjects?: readonly AuthorizationSubject[];
}

export interface ResourceRef {
  type: string;
  id: string;
}

export type AuthorizationRequest<TParams = undefined> = {
  principal: Principal;
  subjects?: readonly AuthorizationSubject[];
  resource: ResourceRef;
  action: string;
} & ([TParams] extends [undefined]
  ? { params?: undefined }
  : { params: TParams });

export type AuthorizationEffect = 'permit' | 'conditional' | 'deny';

export interface AuthorizationReason {
  code: string;
  message: string;
  plugin?: string;
  details?: Readonly<Record<string, unknown>>;
}

export interface AuthorizationConditions {
  type: string;
  [key: string]: unknown;
}

export interface AuthorizationDecision<
  TConditions extends AuthorizationConditions = AuthorizationConditions,
> {
  effect: AuthorizationEffect;
  conditions?: TConditions;
  reasons: readonly AuthorizationReason[];
}

export interface AuthorizationDescription {
  plugins: readonly string[];
  grantProvider?: string;
  resourceTypes: readonly string[];
  constraintResolvers: readonly string[];
}

export class AuthorizationDeniedError extends Error {
  readonly decision: AuthorizationDecision;

  constructor(decision: AuthorizationDecision) {
    super(decision.reasons.at(-1)?.message ?? 'Authorization denied');
    this.name = 'AuthorizationDeniedError';
    this.decision = decision;
  }
}

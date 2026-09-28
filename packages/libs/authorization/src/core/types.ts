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

/**
 * Thrown by `require`. It answers `403 { code: 'FORBIDDEN', message }` on its
 * own: `getResponse` is the interface Hono's default error handler honours,
 * and `status` is what request logging reads.
 */
export class AuthorizationDeniedError extends Error {
  readonly decision: AuthorizationDecision;
  readonly status = 403;

  constructor(decision: AuthorizationDecision) {
    super(decision.reasons.at(-1)?.message ?? 'Authorization denied');
    this.name = 'AuthorizationDeniedError';
    this.decision = decision;
  }

  getResponse(): Response {
    return Response.json(
      { code: 'FORBIDDEN', message: this.message },
      { status: this.status },
    );
  }
}

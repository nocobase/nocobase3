import type {
  AuthorizationIdentity,
  AuthorizationSubject,
  Principal,
  ResourceRef,
} from './types.js';

export interface AuthorizationGrantSource {
  plugin: string;
  id: string;
}

export interface AuthorizationPolicy {
  type: string;
  [key: string]: unknown;
}

export interface AuthorizationGrant {
  source: AuthorizationGrantSource;
  resource: ResourceRef;
  action: string;
  policy?: AuthorizationPolicy;
}

export interface ResolveAuthorizationGrantsInput {
  principal: Principal;
  subjects?: readonly AuthorizationSubject[];
  resource: ResourceRef;
  action: string;
}

export interface ResolveAllAuthorizationGrantsInput {
  principal: Principal;
  subjects?: readonly AuthorizationSubject[];
}

export type AuthorizationGrantsChangedListener = (
  subject: AuthorizationSubject,
) => void | Promise<void>;

export interface AuthorizationGrantService {
  resolve(
    input: ResolveAuthorizationGrantsInput,
  ): Promise<readonly AuthorizationGrant[]>;
  resolveAll(
    input: ResolveAllAuthorizationGrantsInput,
  ): Promise<readonly AuthorizationGrant[]>;
  scope?(identity: AuthorizationIdentity): AuthorizationGrantService;
  /** True when the identity has unrestricted access and per-resource authorization is skipped. */
  unrestricted?(identity: AuthorizationIdentity): Promise<boolean>;
  /** Notifies when the grants a subject resolves to may have changed. */
  onChange?(listener: AuthorizationGrantsChangedListener): () => void;
}

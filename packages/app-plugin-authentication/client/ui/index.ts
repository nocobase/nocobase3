import {
  defineClientRouteComponentOverrides,
  type AppClientRouteComponentLoader,
  type AppClientRouteComponentOverrideDefinition,
} from '@nocobase/app-client/plugins';

export { AuthLink, type AuthLinkProps } from '../components/auth-link.js';
export {
  AuthPageShell,
  type AuthPageShellProps,
} from '../components/auth-page-shell.js';
export { ForgotPasswordForm } from '../forms/forgot-password-form.js';
export { LoginForm } from '../forms/login-form.js';
export { RegisterForm } from '../forms/register-form.js';
export { ResetPasswordForm } from '../forms/reset-password-form.js';

export interface AuthenticationPageRouteIds {
  readonly forgotPassword: string;
  readonly login: string;
  readonly register: string;
  readonly resetPassword: string;
}

export const AUTHENTICATION_PAGE_ROUTE_IDS: AuthenticationPageRouteIds =
  Object.freeze({
    forgotPassword: '@nocobase/app-plugin-authentication:forgot-password',
    login: '@nocobase/app-plugin-authentication:login',
    register: '@nocobase/app-plugin-authentication:register',
    resetPassword: '@nocobase/app-plugin-authentication:reset-password',
  });

export interface AuthenticationPageOverrides {
  readonly forgotPassword?: AuthenticationPageOverride;
  readonly login?: AuthenticationPageOverride;
  readonly register?: AuthenticationPageOverride;
  readonly resetPassword?: AuthenticationPageOverride;
}

export interface AuthenticationPageOverrideDefinition {
  readonly componentEntry?: string;
  readonly componentLoader: AppClientRouteComponentLoader;
}

export type AuthenticationPageOverride =
  AppClientRouteComponentLoader | AuthenticationPageOverrideDefinition;

export function defineAuthenticationPageOverrides(
  overrides: AuthenticationPageOverrides,
): readonly AppClientRouteComponentOverrideDefinition[] {
  const definitions: AppClientRouteComponentOverrideDefinition[] = [];
  for (const key of authenticationPageKeys) {
    const override = overrides[key];
    if (override) {
      const definition =
        typeof override === 'function'
          ? { componentLoader: override }
          : override;
      definitions.push({
        routeId: AUTHENTICATION_PAGE_ROUTE_IDS[key],
        ...definition,
      });
    }
  }
  return defineClientRouteComponentOverrides(definitions);
}

const authenticationPageKeys: readonly (keyof AuthenticationPageOverrides)[] =
  Object.freeze(['login', 'register', 'forgotPassword', 'resetPassword']);

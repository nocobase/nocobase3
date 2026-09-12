export interface AuthenticationRouteIds {
  readonly forgotPassword: string;
  readonly login: string;
  readonly register: string;
  readonly resetPassword: string;
}

export const AUTHENTICATION_ROUTE_IDS: AuthenticationRouteIds = Object.freeze({
  forgotPassword: '@nocobase/app-plugin-authentication:forgot-password',
  login: '@nocobase/app-plugin-authentication:login',
  register: '@nocobase/app-plugin-authentication:register',
  resetPassword: '@nocobase/app-plugin-authentication:reset-password',
});

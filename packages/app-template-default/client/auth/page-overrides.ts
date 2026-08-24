import {
  defineAuthenticationPageOverrides,
  type AuthenticationPageOverrides,
} from '@nocobase/app-plugin-authentication/client/ui';

const authenticationPageLoaders: AuthenticationPageOverrides = {
  login: {
    componentEntry: './client/auth/pages/login-page',
    componentLoader: () => import('./pages/login-page'),
  },
  register: {
    componentEntry: './client/auth/pages/register-page',
    componentLoader: () => import('./pages/register-page'),
  },
  forgotPassword: {
    componentEntry: './client/auth/pages/forgot-password-page',
    componentLoader: () => import('./pages/forgot-password-page'),
  },
  resetPassword: {
    componentEntry: './client/auth/pages/reset-password-page',
    componentLoader: () => import('./pages/reset-password-page'),
  },
};

const authenticationPageOverrides = defineAuthenticationPageOverrides(
  authenticationPageLoaders,
);

export default authenticationPageOverrides;

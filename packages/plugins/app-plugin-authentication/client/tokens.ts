import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';
export const authenticationClientToken: ServiceToken<unknown> =
  createServiceToken<unknown>('@nocobase/authentication/client');

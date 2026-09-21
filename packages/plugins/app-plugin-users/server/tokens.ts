import { createServiceToken, type ServiceToken } from '@nocobase/service-provider';
import type { UserService } from './service.js';
import type { UserLifecycleRegistry } from './lifecycle.js';
export const userServiceToken: ServiceToken<UserService> = createServiceToken<UserService>('@nocobase/app-plugin-users/service');
export const userLifecycleToken: ServiceToken<UserLifecycleRegistry> = createServiceToken<UserLifecycleRegistry>('@nocobase/app-plugin-users/lifecycle');

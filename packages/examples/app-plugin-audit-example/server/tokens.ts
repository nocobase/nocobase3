import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';
import type { CustomerService } from './services/audit-example.js';
export const customerServiceToken: ServiceToken<CustomerService> =
  createServiceToken<CustomerService>(
    '@nocobase/app-plugin-audit-example/customers',
  );

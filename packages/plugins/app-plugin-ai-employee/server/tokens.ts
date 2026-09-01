import type { AIManager } from '@nocobase/ai-employee';
import type { ServiceToken } from '@nocobase/service-provider';
import { createServiceToken } from '@nocobase/service-provider';

import type { Context } from './context.js';

export const aiManagerToken: ServiceToken<AIManager> =
  createServiceToken<AIManager>('@nocobase/app-plugin-ai-employee/manager');

export const aiEmployeeRuntimeToken: ServiceToken<Context> =
  createServiceToken<Context>('@nocobase/app-plugin-ai-employee/runtime');

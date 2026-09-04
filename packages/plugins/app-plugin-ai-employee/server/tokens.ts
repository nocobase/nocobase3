import type { AIManager } from '@nocobase/ai-employee';
import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

/** Public cross-plugin AI manager capability. */
export const aiManagerToken: ServiceToken<AIManager> =
  createServiceToken<AIManager>('@nocobase/app-plugin-ai-employee/manager');

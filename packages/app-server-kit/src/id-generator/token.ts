import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

import type { IdGeneratorService } from '@nocobase/id-generator';

export const idGeneratorToken: ServiceToken<IdGeneratorService> =
  createServiceToken<IdGeneratorService>('@nocobase/id-generator');

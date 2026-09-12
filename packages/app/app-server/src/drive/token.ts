import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

import type { NocoBaseDriveManager } from '@nocobase/drive';

export const driveManagerToken: ServiceToken<NocoBaseDriveManager> =
  createServiceToken<NocoBaseDriveManager>('@nocobase/drive/manager');

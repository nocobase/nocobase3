import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

import type { FilePluginRuntimeResult } from './plugin-runtime.js';

export const filePluginRuntimeToken: ServiceToken<FilePluginRuntimeResult> =
  createServiceToken<FilePluginRuntimeResult>(
    '@nocobase/app-plugin-file/runtime',
  );

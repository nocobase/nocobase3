import type { AppPluginProviderConstructor } from '@nocobase/app-server-kit/plugins';

import { FileProvider, type FileProviderApplication } from './file.js';

const providers: readonly AppPluginProviderConstructor<
  FileProviderApplication['config']
>[] = [FileProvider];

export default providers;

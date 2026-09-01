import type {
  AppPluginApplication,
  AppPluginProviderConstructor,
} from '@nocobase/app-server/plugins';
import { ServiceProvider } from '@nocobase/service-provider';

import { resolveFilePluginRuntime } from '../plugin-runtime.js';
import { filePluginRuntimeToken } from '../runtime-token.js';

export type FileProviderApplication = AppPluginApplication;

export class FileProvider<
  TApplication extends FileProviderApplication = FileProviderApplication,
> extends ServiceProvider<TApplication> {
  public readonly name: string = '@nocobase/app-plugin-file';

  public override register(): void {
    this.app.container.singleton(filePluginRuntimeToken, (container) =>
      resolveFilePluginRuntime(container, this.app.config),
    );
  }
}

const serviceProviders: readonly AppPluginProviderConstructor<
  FileProviderApplication['config']
>[] = [FileProvider];

export default serviceProviders;

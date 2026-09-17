import { queueServiceToken } from '@nocobase/app-server/queue';
import type { UnregisterHandler } from '@nocobase/queue';
import {
  ServiceProvider,
  type ServiceContainer,
} from '@nocobase/service-provider';

import {
  __NOCOBASE_SYMBOL_NAME__Handler,
  __NOCOBASE_MODULE_NAME__Queue,
} from '../jobs/__NOCOBASE_SHORT_NAME__.js';

export interface __NOCOBASE_SYMBOL_NAME__JobsApplication {
  readonly container: ServiceContainer;
}

export class __NOCOBASE_SYMBOL_NAME__JobsProvider extends ServiceProvider<__NOCOBASE_SYMBOL_NAME__JobsApplication> {
  public readonly name: string = __NOCOBASE_JOB_NAME_LITERAL__;
  private unregister: UnregisterHandler | undefined;

  public override async boot(): Promise<void> {
    const queue = this.app.container.resolve(queueServiceToken);
    const handler = new __NOCOBASE_SYMBOL_NAME__Handler();
    this.unregister = queue
      .consumer(__NOCOBASE_MODULE_NAME__Queue)
      .consume((channel, message, signal) =>
        handler.handle(channel, message, signal),
      );
  }

  public override async shutdown(): Promise<void> {
    await this.unregister?.();
    this.unregister = undefined;
    // Release handler dependencies only after its active calls have settled.
  }
}

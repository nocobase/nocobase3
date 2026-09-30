import type { JobExecutor } from '@nocobase/jobs';
import {
  ServiceProvider,
  type ServiceContainer,
} from '@nocobase/service-provider';

import {
  __NOCOBASE_SYMBOL_NAME__Job,
  get__NOCOBASE_SYMBOL_NAME__JobExecutor,
} from '../jobs/__NOCOBASE_SHORT_NAME__.js';

export interface __NOCOBASE_SYMBOL_NAME__JobsApplication {
  readonly container: ServiceContainer;
}

export class __NOCOBASE_SYMBOL_NAME__JobsProvider extends ServiceProvider<__NOCOBASE_SYMBOL_NAME__JobsApplication> {
  public readonly name: string = __NOCOBASE_JOB_NAME_LITERAL__;
  private executor: JobExecutor | undefined;

  public override async start(): Promise<void> {
    const executor = get__NOCOBASE_SYMBOL_NAME__JobExecutor(this.app.container);
    // Register every class before setup(): setup() starts consuming, and a
    // task waiting from an earlier run must find its handler.
    executor.registerJob(__NOCOBASE_SYMBOL_NAME__Job);
    await executor.setup();
    this.executor = executor;
  }

  public override async shutdown(): Promise<void> {
    const executor = this.executor;
    this.executor = undefined;
    // Aborts running tasks and waits for them; release their dependencies only afterwards.
    await executor?.shutdown();
  }
}

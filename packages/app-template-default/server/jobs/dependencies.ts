import type { DatabaseManager } from '@nocobase/app-database';
import type { FilesRuntime } from '@nocobase/app-plugin-files/server';
import type { Logger } from '@nocobase/logging';
import type { JobClass, JobFactory } from '@nocobase/queue';

export interface AppJobDependencies {
  logger: Logger;
  database?: DatabaseManager;
  filesRuntime?: FilesRuntime;
}

export function createAppJobFactory(
  dependencies: AppJobDependencies,
): JobFactory {
  return (JobClass: JobClass) => new JobClass(dependencies);
}

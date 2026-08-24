import type { DatabaseManager } from '@nocobase/database';
import type { FilesRuntime } from '@nocobase/app-plugin-files/server';
import type { Logger } from '@nocobase/logging';
import type { Job, JobClass, JobFactory } from '@nocobase/queue';

export interface AppJobDependencies {
  logger: Logger;
  database?: DatabaseManager;
  filesRuntime?: FilesRuntime;
}

export function createAppJobFactory(
  dependencies: AppJobDependencies,
): JobFactory {
  return (JobClass: JobClass) => new JobClass(dependencies) as Job;
}

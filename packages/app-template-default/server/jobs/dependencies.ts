import type { DatabaseManager } from '@nocobase/database';
import type { Logger } from '@nocobase/logging';
import type { Job, JobClass, JobFactory } from '@nocobase/queue';

export interface AppJobDependencies {
  logger: Logger;
  database?: DatabaseManager;
}

export function createAppJobFactory(dependencies: AppJobDependencies): JobFactory {
  return (JobClass: JobClass) => new JobClass(dependencies) as Job;
}

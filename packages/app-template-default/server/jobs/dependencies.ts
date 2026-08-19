import type { DatabaseManager } from '@nocobase/database';
import type { NocoBaseLogger } from '@nocobase/logger';
import type { Job, JobClass, JobFactory } from '@nocobase/queue';

export interface AppJobDependencies {
  logger: NocoBaseLogger;
  database?: DatabaseManager;
}

export function createAppJobFactory(dependencies: AppJobDependencies): JobFactory {
  return (JobClass: JobClass) => new JobClass(dependencies) as Job;
}

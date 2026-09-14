import type { ApiClient, RemoteRepository } from '@nocobase/app-client';

export interface Task {
  readonly id: number;
  readonly title: string;
  readonly status: 'open' | 'done';
  readonly ownerId: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type TaskValues = Partial<Task>;

export const TASKS_COLLECTION: string = 'authorizationExampleTasks';

export function tasksRepository(
  api: ApiClient,
): RemoteRepository<Task, TaskValues, TaskValues> {
  return api.repository<Task, TaskValues, TaskValues>(TASKS_COLLECTION);
}

/**
 * Creating goes through the plugin's own route, which stamps the owner from
 * the principal. The body carries a title and nothing else.
 */
export function createTask(api: ApiClient, title: string): Promise<unknown> {
  return api.request({
    method: 'POST',
    path: '/authorization-example/tasks',
    json: { title },
  });
}

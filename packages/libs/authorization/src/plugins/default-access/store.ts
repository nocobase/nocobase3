import type { DefaultAccessRule } from './model.js';

export interface DefaultAccessStore {
  list(): Promise<readonly DefaultAccessRule[]>;
  get(
    resourceType: string,
    resourceId: string,
  ): Promise<DefaultAccessRule | undefined>;
  set(rule: DefaultAccessRule): Promise<DefaultAccessRule>;
  delete(resourceType: string, resourceId: string): Promise<void>;
}

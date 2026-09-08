import type { AIMessage, WorkContext } from '@nocobase/ai-employee';

export interface WorkContextHandler {
  resolve(workContext: readonly WorkContext[]): Promise<string[]>;
  background(aiMessages: readonly AIMessage[]): Promise<string[]>;
}

export class DefaultWorkContextHandler implements WorkContextHandler {
  public async resolve(workContext: readonly WorkContext[]): Promise<string[]> {
    if (!Array.isArray(workContext)) return [];
    return workContext
      .map((item) =>
        item.content == null
          ? ''
          : typeof item.content === 'string'
            ? item.content
            : JSON.stringify(item.content),
      )
      .filter(Boolean);
  }

  public async background(
    _aiMessages: readonly AIMessage[],
  ): Promise<string[]> {
    return [];
  }
}

export function createWorkContextHandler(): WorkContextHandler {
  return new DefaultWorkContextHandler();
}

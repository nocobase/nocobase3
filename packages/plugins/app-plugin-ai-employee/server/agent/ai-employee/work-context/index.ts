import type { AIMessage, WorkContext } from '@nocobase/ai-employee';
import type { Context } from '../../../context.js';

export type WorkContextResolveStrategy = (
  ctx: Context,
  contextItem: WorkContext,
) => Promise<string>;

export type WorkContextBackgroundStrategy = (
  ctx: Context,
  aiMessages: AIMessage[],
  workContext: WorkContext[],
) => Promise<string>;

export type WorkContextStrategies = {
  resolve?: WorkContextResolveStrategy;
  background?: WorkContextBackgroundStrategy;
};

export interface WorkContextHandler {
  registerStrategy(type: string, strategies: WorkContextStrategies): void;
  resolve(ctx: Context, workContext: WorkContext[]): Promise<string[]>;
  background(ctx: Context, aiMessages: AIMessage[]): Promise<string[]>;
}

export class DefaultWorkContextHandler implements WorkContextHandler {
  private readonly strategies = new Map<string, WorkContextStrategies>();

  registerStrategy(type: string, strategies: WorkContextStrategies): void {
    this.strategies.set(type, strategies);
  }

  async resolve(ctx: Context, workContext: WorkContext[]): Promise<string[]> {
    if (!Array.isArray(workContext)) return [];
    const resolved = await Promise.all(
      workContext.map(async (item): Promise<string> => {
        const strategy = this.strategies.get(item.type)?.resolve;
        if (strategy) return strategy(ctx, item);
        return item.content == null
          ? ''
          : typeof item.content === 'string'
            ? item.content
            : JSON.stringify(item.content);
      }),
    );
    return resolved.filter(Boolean);
  }

  async background(ctx: Context, aiMessages: AIMessage[]): Promise<string[]> {
    const workContext = aiMessages.flatMap(
      (message) => message.workContext ?? [],
    );
    const backgrounds = await Promise.all(
      [...this.strategies.values()].map(async (strategy): Promise<string> => {
        if (!strategy.background) return '';
        return strategy.background(ctx, aiMessages, workContext);
      }),
    );
    return backgrounds.filter(Boolean);
  }
}

export function createWorkContextHandler(): WorkContextHandler {
  return new DefaultWorkContextHandler();
}

import type { Hono } from 'hono';
import { aiActionPath, createAIActionHandler } from './router-utils.js';

export function createAIRouter(app: Hono, apiBasePath: string): void {
  app.all(
    aiActionPath(apiBasePath, 'ai:listAllEnabledModels'),
    createAIActionHandler('ai:listAllEnabledModels', ({ ctx }) =>
      ctx.modelService.listEnabled(ctx),
    ),
  );

  app.all(
    aiActionPath(apiBasePath, 'ai:listLLMProviders'),
    createAIActionHandler('ai:listLLMProviders', ({ ctx }) =>
      ctx.modelService.listLLMProviders(ctx),
    ),
  );

  app.all(
    aiActionPath(apiBasePath, 'ai:listLLMServices'),
    createAIActionHandler('ai:listLLMServices', ({ ctx, url }) =>
      ctx.modelService.listLLMServices(
        ctx,
        url.searchParams.get('model') ?? undefined,
      ),
    ),
  );

  app.all(
    aiActionPath(apiBasePath, 'ai:listModels'),
    createAIActionHandler('ai:listModels', ({ ctx, url }) =>
      ctx.modelService.listModels(
        ctx,
        url.searchParams.get('llmService') ?? '',
        url.searchParams.get('model') ?? undefined,
      ),
    ),
  );

  app.all(
    aiActionPath(apiBasePath, 'ai:listProviderModels'),
    createAIActionHandler('ai:listProviderModels', () =>
      unsupportedAIAction('ai:listProviderModels'),
    ),
  );

  app.all(
    aiActionPath(apiBasePath, 'ai:testFlight'),
    createAIActionHandler('ai:testFlight', () =>
      unsupportedAIAction('ai:testFlight'),
    ),
  );
}

function unsupportedAIAction(action: string): never {
  throw new Error(`Unsupported AI action: ${action}`);
}

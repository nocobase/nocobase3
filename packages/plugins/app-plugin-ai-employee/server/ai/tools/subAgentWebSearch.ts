/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { defineTools, type AIManager } from '@nocobase/ai-employee';
import { z } from 'zod';
import { aiManagerToken } from '../../provider/ai-employee.js';

export default defineTools({
  scope: 'SPECIFIED',
  defaultPermission: 'ALLOW',
  i18n: { namespace: '@nocobase/app-plugin-ai-employee' },
  introduction: {
    title: 'Web search',
    about:
      'Use web search to quickly find up-to-date information from the internet.',
  },
  definition: {
    name: 'subAgentWebSearch',
    description:
      'Search the web for current information. Put all independent search queries needed for this turn into one call so they can run in parallel. Do not call this tool repeatedly with similar queries unless the previous results are clearly insufficient for a critical missing fact.',
    schema: z.object({
      query: z
        .array(z.string())
        .describe(
          'A list of clear, specific, non-overlapping web search queries. Include all independent queries needed for this answer in a single tool call so they can run in parallel.',
        ),
    }),
  },
  dependencies: { ai: aiManagerToken },
  invoke: async (ctx, args: { query: string[] }) => {
    const { model } = ctx.state;
    if (
      typeof model?.llmService !== 'string' ||
      typeof model.model !== 'string'
    ) {
      throw new Error('Web search model is not configured');
    }
    // Searching is the provider's capability, not this tool's. Without it the
    // request below still reaches a model, and a model handed a retrieval
    // prompt answers from training data with sources that look real. Refuse
    // instead: a caller can act on "no search ran", not on a plausible answer.
    const unsupported = await describeUnsupportedWebSearch(ctx.deps.ai, model);
    if (unsupported) {
      return { status: 'error', content: unsupported };
    }
    const { provider } = await ctx.deps.ai.llmProviderManager.getLLMService({
      llmService: model.llmService,
      model: model.model,
      webSearch: true,
      reasoning: { mode: 'off' },
    });
    if (!args.query?.length) {
      return {
        status: 'success',
        content:
          'Web search not invoke correctly. There is no query parameters provided',
      };
    }

    const running = args.query.map((query) =>
      provider
        .invoke(
          {
            messages: [
              {
                role: 'system',
                content: WEB_SEARCH_SYSTEM_PROMPT,
              },
              {
                role: 'user',
                content: query,
              },
            ],
          },
          {
            tags: ['langsmith:nostream'],
          },
        )
        .then((content: { text: unknown }) => content.text as string)
        .then((result: string) => ({ query, result })),
    );

    const result = await Promise.all(running);
    return {
      status: 'success',
      content: result,
    };
  },
});

/**
 * Why this turn cannot search, or `undefined` when it can. Provider metadata is
 * the only record of the capability: `builtIn.webSearch` is silently ignored by
 * a provider that does not implement it.
 */
async function describeUnsupportedWebSearch(
  ai: AIManager,
  model: { llmService: string; model: string },
): Promise<string | undefined> {
  const service = await ai.llmServiceManager.getLLMService(model.llmService);
  if (!service) {
    return `Web search did not run: LLM service "${model.llmService}" is not configured.`;
  }
  const provider = ai.llmProviderManager
    .listLLMProviders()
    .find((candidate) => candidate.name === service.provider);
  if (!provider?.supportWebSearch) {
    return `Web search did not run: provider "${service.provider}" has no built-in web search, so no results were retrieved. Do not answer from memory. Use a configured MCP search server, or switch this conversation to a model whose provider supports web search.`;
  }
  if (
    provider.webSearchModels &&
    !provider.webSearchModels.includes(model.model)
  ) {
    return `Web search did not run: model "${model.model}" does not support web search on provider "${service.provider}". Supported models: ${provider.webSearchModels.join(', ')}.`;
  }
  return undefined;
}

const WEB_SEARCH_SYSTEM_PROMPT = `You are a web search retrieval assistant.

Your output is for another AI model, not the final user-facing answer.

Requirements:
1. Retrieve current, relevant information for the query.
2. Return concise findings only. Do not write a polished final answer.
3. Include source title, publisher/site, URL, and publication or update date when available.
4. Prefer authoritative and recent sources.
5. Distinguish confirmed facts from uncertain or incomplete information.
6. Do not fabricate results, sources, dates, or URLs.
7. If results are weak, say exactly what is missing instead of broadening the search yourself.

Output format:
- Findings: 3-6 concise bullet points.
- Sources: numbered list with title, site, URL, and date when available.
- Gaps: one short sentence if important information could not be verified.`;

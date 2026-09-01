/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import type { ConversationRequestExecution, Context } from '../context.js';
import { z } from 'zod';
import {
  EXECUTE_FRONTEND_TOOL_NAME,
  LOAD_FRONTEND_TOOL_NAME,
  type FrontendToolManifest,
  isFrontendToolManifest,
} from './common/frontend-tools.js';
import type { WorkContext } from '@nocobase/ai-employee';

type MessageLike = {
  role?: string;
  workContext?: WorkContext[];
};

type ConversationLike = {
  options?: unknown;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const isMessageLike = (value: unknown): value is MessageLike =>
  !!value && typeof value === 'object';

const normalizeFrontendToolManifests = (
  value: unknown,
): FrontendToolManifest[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  const manifests = new Map<string, FrontendToolManifest>();
  for (const manifest of value) {
    if (
      isFrontendToolManifest(manifest) &&
      manifest.id === `${manifest.blockUid}:${manifest.name}`
    ) {
      manifests.set(manifest.id, manifest);
    }
  }
  return Array.from(manifests.values());
};

export const extractFrontendToolManifests = (
  workContext: WorkContext[],
): FrontendToolManifest[] => {
  const manifests = new Map<string, FrontendToolManifest>();
  for (const item of workContext) {
    const frontendTools = Array.isArray(item?.frontendTools)
      ? item.frontendTools
      : [];
    for (const frontendTool of frontendTools) {
      if (
        isFrontendToolManifest(frontendTool) &&
        frontendTool.blockUid === item.uid &&
        frontendTool.id === `${item.uid}:${frontendTool.name}`
      ) {
        manifests.set(frontendTool.id, frontendTool);
      }
    }
  }
  return Array.from(manifests.values());
};

const findRequestFrontendTools = (
  execution?: ConversationRequestExecution,
): FrontendToolManifest[] => {
  const explicitlyProvided = normalizeFrontendToolManifests(
    execution?.frontendTools,
  );
  if (explicitlyProvided.length) {
    return explicitlyProvided;
  }
  const messages = Array.isArray(execution?.messages)
    ? execution.messages.filter(isMessageLike)
    : [];
  for (const message of messages) {
    if (message.role !== 'user') {
      continue;
    }
    const frontendTools = extractFrontendToolManifests(
      Array.isArray(message.workContext) ? message.workContext : [],
    );
    if (frontendTools.length) {
      return frontendTools;
    }
  }
  return [];
};

export const listCurrentFrontendTools = async (
  ctx: Context,
  execution: ConversationRequestExecution = {},
): Promise<FrontendToolManifest[]> => {
  const currentSessionId =
    typeof execution.sessionId === 'string' ? execution.sessionId : '';
  if (!currentSessionId) {
    return findRequestFrontendTools(execution);
  }

  const conversationRepository = ctx.repositories.aiConversations;
  const conversation = (await conversationRepository.findOne({
    filter: {
      sessionId: currentSessionId,
    },
  })) as ConversationLike | null;
  const options = conversation?.options;
  const boundTools = normalizeFrontendToolManifests(
    isRecord(options) ? options.frontendTools : undefined,
  );
  if (boundTools.length) {
    return boundTools;
  }

  const frontendTools = findRequestFrontendTools(execution);
  if (!frontendTools.length || !conversation) {
    return frontendTools;
  }

  await conversationRepository.update({
    filter: {
      sessionId: currentSessionId,
    },
    values: {
      options: {
        ...(isRecord(options) ? options : {}),
        frontendTools,
      },
    },
  });
  return frontendTools;
};

export const findCurrentFrontendTool = async (
  ctx: Context,
  toolId: string,
  execution: ConversationRequestExecution = {},
): Promise<FrontendToolManifest | undefined> => {
  const tools = await listCurrentFrontendTools(ctx, execution);
  return tools.find((tool) => tool.id === toolId);
};

export const shouldAutoExecuteFrontendTool = (
  tools: FrontendToolManifest[],
  args: unknown,
): boolean => {
  if (!isRecord(args) || typeof args.toolId !== 'string') {
    return false;
  }
  return tools.find((tool) => tool.id === args.toolId)?.permission === 'ALLOW';
};

export const prepareToolsForFrontendConversation = <
  T extends { definition: { name: string; description: string } },
>(
  tools: T[],
  frontendTools: FrontendToolManifest[],
): T[] => {
  if (!frontendTools.length) {
    return tools.filter(
      (tool) =>
        tool.definition.name !== LOAD_FRONTEND_TOOL_NAME &&
        tool.definition.name !== EXECUTE_FRONTEND_TOOL_NAME,
    );
  }

  const catalog = frontendTools.map(({ id, name, title, description }) => ({
    id,
    name,
    title,
    description,
  }));
  const toolIds = frontendTools.map((tool) => tool.id) as [string, ...string[]];
  const toolIdSchema = z
    .enum(toolIds)
    .describe(
      `Use an exact tool id from this catalog: ${JSON.stringify(catalog)}`,
    );
  return tools.map((tool) => {
    if (
      tool.definition.name !== LOAD_FRONTEND_TOOL_NAME &&
      tool.definition.name !== EXECUTE_FRONTEND_TOOL_NAME
    ) {
      return tool;
    }
    const isLoader = tool.definition.name === LOAD_FRONTEND_TOOL_NAME;
    return {
      ...tool,
      definition: {
        ...tool.definition,
        description: `${tool.definition.description}\n\nfrontendToolCatalog: ${JSON.stringify(catalog)}`,
        schema: isLoader
          ? z.object({ toolId: toolIdSchema })
          : z.object({
              toolId: toolIdSchema,
              args: z.record(z.string(), z.unknown()).default({}),
            }),
      },
    };
  });
};

export const readFrontendToolResult = (
  execution: ConversationRequestExecution,
  toolCallId: string,
): { provided: true; value: unknown } | undefined => {
  const result = execution.toolCallResults?.find(
    (item) => item.id === toolCallId,
  );
  return result ? { provided: true, value: result.result } : undefined;
};

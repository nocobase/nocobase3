/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import type { Context } from '../../internal/runtime-context.js';
import type { RuntimeServices } from '../../internal/runtime-services.js';
import type { RepositoryFactory } from '../../repository/database/factory.js';
import type { AIEmployeeEntity } from '@nocobase/ai-employee';
import type { AIEmployee as AIEmployeeType } from '@nocobase/ai-employee';
import type { SubAgentConversationMetadata } from '@nocobase/ai-employee';

export async function listAccessibleAIEmployees(
  ctx: Context,
  repositories: RepositoryFactory,
): Promise<AIEmployeeEntity[]> {
  const filter = await buildAccessibleEmployeeFilter(ctx);
  return repositories.aiEmployees.find({
    filter,
    sort: ['sort', 'username'],
  });
}

export async function getAccessibleAIEmployee(
  ctx: Context,
  repositories: RepositoryFactory,
  username: string,
): Promise<AIEmployeeEntity | null> {
  const filter = await buildAccessibleEmployeeFilter(ctx);
  return repositories.aiEmployees.findOne({
    filter: {
      ...filter,
      username,
    },
  });
}

function localizeBuiltInInfo(
  ctx: Context,
  runtime: RuntimeServices,
  employee: AIEmployeeEntity,
) {
  runtime.builtInManager.setupBuiltInInfo(
    ctx,
    employee as unknown as AIEmployeeType,
  );
}

export function serializeEmployeeSummary(
  ctx: Context,
  runtime: RuntimeServices,
  employee: AIEmployeeEntity,
) {
  localizeBuiltInInfo(ctx, runtime, employee);
  return {
    username: employee.username as string,
    nickname: employee.nickname as string,
    position: employee.position as string,
    bio: employee.bio as string,
    greeting: employee.greeting as string,
    skillSettings: employee.skillSettings,
  };
}

export function serializeEmployeeDetail(
  ctx: Context,
  runtime: RuntimeServices,
  employee: AIEmployeeEntity,
) {
  localizeBuiltInInfo(ctx, runtime, employee);
  const about = employee.about || employee.defaultPrompt || '';
  return {
    ...serializeEmployeeSummary(ctx, runtime, employee),
    about,
  };
}

async function buildAccessibleEmployeeFilter(ctx: Context) {
  const filter: Record<string, any> = {
    enabled: true,
    category: 'business',
    deprecated: false,
  };

  if (ctx.state.currentRoles?.includes('root')) {
    return filter;
  }

  return filter;
}

export const getSkillSettingsFromMain = async (
  ctx: Context,
  repositories: RepositoryFactory,
  sessionId: string,
): Promise<Record<string, any> | null | undefined> => {
  if (!sessionId) {
    return null;
  }
  const aiConversation = await repositories.aiConversations.findOne({
    filter: {
      sessionId,
      userId: ctx.auth?.user?.id,
    },
  });
  const skillSettings = aiConversation?.options?.skillSettings;
  return skillSettings && typeof skillSettings === 'object'
    ? (skillSettings as Record<string, any>)
    : skillSettings == null
      ? skillSettings
      : undefined;
};

export const updateMessageMetadata = async (
  repositories: RepositoryFactory,
  sessionId: string,
  toolCallId: string,
  subSessionId: string,
  status: 'pending' | 'completed',
): Promise<void> => {
  if (!sessionId) {
    return;
  }
  const aiToolMessage = await repositories.aiToolMessages.findOne({
    filter: {
      sessionId,
      toolCallId,
    },
  });
  if (!aiToolMessage) {
    return;
  }
  const aiMessage = await repositories.aiMessages.findOne({
    filter: {
      sessionId,
      messageId: String(aiToolMessage.messageId),
    },
  });
  if (!aiMessage) {
    return;
  }
  const metadata = aiMessage.metadata ?? {};
  if (!metadata.subAgentConversations) {
    metadata.subAgentConversations = [];
  }

  const subAgentConversations =
    metadata.subAgentConversations as SubAgentConversationMetadata[];
  const existingConversation = subAgentConversations.find(
    (item) => item.sessionId === subSessionId,
  );

  if (existingConversation) {
    existingConversation.toolCallId = toolCallId;
    existingConversation.status = status;
  } else {
    subAgentConversations.push({
      sessionId: subSessionId,
      toolCallId,
      status,
    });
  }

  metadata.subAgentConversations = subAgentConversations;

  await repositories.aiMessages.update({
    values: {
      metadata,
    },
    filter: {
      sessionId,
      messageId: aiMessage.messageId,
    },
  });
};

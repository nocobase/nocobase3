/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import type { BuiltInManager } from '../built-in-manager.js';
import type { RepositoryFactory } from '../../factory/repository-factory.js';
import type { AIEmployeeEntity } from '@nocobase/ai-employee';
import type { AIEmployee as AIEmployeeType } from '@nocobase/ai-employee';
import type { SubAgentConversationMetadata } from '@nocobase/ai-employee';
import type { Translate } from '../../domain/contracts.js';

export async function listAccessibleAIEmployees({
  roleNames,
  repositories,
}: {
  roleNames: readonly string[];
  repositories: RepositoryFactory;
}): Promise<AIEmployeeEntity[]> {
  const filter = buildAccessibleEmployeeFilter(roleNames);
  return repositories.aiEmployees.find({
    filter,
    sort: ['sort', 'username'],
  });
}

export async function getAccessibleAIEmployee({
  roleNames,
  repositories,
  username,
}: {
  roleNames: readonly string[];
  repositories: RepositoryFactory;
  username: string;
}): Promise<AIEmployeeEntity | null> {
  const filter = buildAccessibleEmployeeFilter(roleNames);
  return repositories.aiEmployees.findOne({
    filter: { ...filter, username },
  });
}

function localizeBuiltInInfo(
  translate: Translate | undefined,
  builtInManager: BuiltInManager,
  employee: AIEmployeeEntity,
): void {
  builtInManager.setupBuiltInInfo({
    employee: employee as unknown as AIEmployeeType,
    translate,
  });
}

export function serializeEmployeeSummary({
  employee,
  builtInManager,
  translate,
}: {
  employee: AIEmployeeEntity;
  builtInManager: BuiltInManager;
  translate?: Translate;
}) {
  localizeBuiltInInfo(translate, builtInManager, employee);
  return {
    username: employee.username as string,
    nickname: employee.nickname as string,
    position: employee.position as string,
    bio: employee.bio as string,
    greeting: employee.greeting as string,
    skillSettings: employee.skillSettings,
  };
}

export function serializeEmployeeDetail({
  employee,
  builtInManager,
  translate,
}: {
  employee: AIEmployeeEntity;
  builtInManager: BuiltInManager;
  translate?: Translate;
}) {
  const summary = serializeEmployeeSummary({
    employee,
    builtInManager,
    translate,
  });
  return { ...summary, about: employee.about || employee.defaultPrompt || '' };
}

function buildAccessibleEmployeeFilter(
  roleNames: readonly string[],
): Record<string, unknown> {
  const filter: Record<string, unknown> = {
    enabled: true,
    category: 'business',
    deprecated: false,
  };
  if (roleNames.includes('root')) return filter;
  return filter;
}

export const getSkillSettingsFromMain = async ({
  actorId,
  repositories,
  sessionId,
}: {
  actorId: string | number;
  repositories: RepositoryFactory;
  sessionId: string;
}): Promise<Record<string, unknown> | null | undefined> => {
  if (!sessionId) return null;
  const aiConversation = await repositories.aiConversations.findOne({
    filter: { sessionId, userId: actorId },
  });
  const skillSettings = aiConversation?.options?.skillSettings;
  return skillSettings && typeof skillSettings === 'object'
    ? (skillSettings as Record<string, unknown>)
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

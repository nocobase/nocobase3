import type {
  AgentContext,
  AIEmployee as AIEmployeeType,
  AIEmployeeEntity,
  SubAgentConversationMetadata,
} from '@nocobase/ai-employee';
import type { ManagerFactory } from '../../factory/manager-factory.js';
import type { RepositoryFactory } from '../../factory/repository-factory.js';

/** What a sub-agent tool declares, and therefore what these helpers read. */
export type SubAgentDeps = {
  repositories: RepositoryFactory;
  managers: ManagerFactory;
};

type EmployeeLookupContext = AgentContext<SubAgentDeps>;
type SkillSettingsContext = AgentContext<Pick<SubAgentDeps, 'repositories'>>;
type MessageMetadataContext = AgentContext<Pick<SubAgentDeps, 'repositories'>>;

export async function listAccessibleAIEmployees(
  ctx: EmployeeLookupContext,
): Promise<AIEmployeeEntity[]> {
  const filter = buildAccessibleEmployeeFilter(ctx);
  return ctx.deps.repositories.aiEmployees.find({
    filter,
    sort: ['sort', 'username'],
  });
}

export async function getAccessibleAIEmployee(
  ctx: EmployeeLookupContext,
  username: string,
): Promise<AIEmployeeEntity | null> {
  const filter = buildAccessibleEmployeeFilter(ctx);
  return ctx.deps.repositories.aiEmployees.findOne({
    filter: { ...filter, username },
  });
}

function localizeBuiltInInfo(
  ctx: EmployeeLookupContext,
  employee: AIEmployeeEntity,
): void {
  ctx.deps.managers.builtInManager.setupBuiltInInfo({
    employee: employee as unknown as AIEmployeeType,
    translate: ctx.runtime.translate,
  });
}

export function serializeEmployeeSummary(
  ctx: EmployeeLookupContext,
  employee: AIEmployeeEntity,
): Record<string, unknown> {
  localizeBuiltInInfo(ctx, employee);
  return {
    username: employee.username,
    nickname: employee.nickname,
    position: employee.position,
    bio: employee.bio,
    greeting: employee.greeting,
    skillSettings: employee.skillSettings,
  };
}

export function serializeEmployeeDetail(
  ctx: EmployeeLookupContext,
  employee: AIEmployeeEntity,
): Record<string, unknown> {
  localizeBuiltInInfo(ctx, employee);
  const about = employee.about || employee.defaultPrompt || '';
  return { ...serializeEmployeeSummary(ctx, employee), about };
}

function buildAccessibleEmployeeFilter(
  ctx: Pick<EmployeeLookupContext, 'actor'>,
): Record<string, unknown> {
  const filter: Record<string, unknown> = {
    enabled: true,
    category: 'business',
    deprecated: false,
  };
  if (ctx.actor.isRoot || ctx.actor.roles.includes('root')) return filter;
  return filter;
}

export const getSkillSettingsFromMain = async (
  ctx: SkillSettingsContext,
  sessionId?: string,
): Promise<unknown> => {
  if (!sessionId) return null;
  const aiConversation = await ctx.deps.repositories.aiConversations.findOne({
    filter: { sessionId, userId: ctx.actor.id },
  });
  return aiConversation?.options?.skillSettings;
};

export const updateMessageMetadata = async (
  ctx: MessageMetadataContext,
  toolCallId: string,
  subSessionId: string,
  status: 'pending' | 'completed',
  sessionId?: string,
): Promise<void> => {
  if (!sessionId) return;
  const aiToolMessage = await ctx.deps.repositories.aiToolMessages.findOne({
    filter: { sessionId, toolCallId },
  });
  if (!aiToolMessage) return;
  const aiMessage = await ctx.deps.repositories.aiMessages.findOne({
    filter: { sessionId, messageId: String(aiToolMessage.messageId) },
  });
  if (!aiMessage) return;
  const metadata = aiMessage.metadata ?? {};
  const subAgentConversations = (metadata.subAgentConversations ??
    []) as SubAgentConversationMetadata[];
  const existingConversation = subAgentConversations.find(
    (item) => item.sessionId === subSessionId,
  );
  if (existingConversation) {
    existingConversation.toolCallId = toolCallId;
    existingConversation.status = status;
  } else {
    subAgentConversations.push({ sessionId: subSessionId, toolCallId, status });
  }
  await ctx.deps.repositories.aiMessages.update({
    values: { metadata: { ...metadata, subAgentConversations } },
    filter: { sessionId, messageId: aiMessage.messageId },
  });
};

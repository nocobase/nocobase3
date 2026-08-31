import {
  defineTools,
  type AgentContext,
  type AIEmployeeRepository,
} from '@nocobase/ai-employee';
import { z } from 'zod';
import type {
  AIConversationRepository,
  AIMessageRepository,
  AIToolMessageRepository,
} from '../../../server/repository/index.js';
import type { ModelRef } from '../../../server/ai-employees/ai-employee.js';
import type {
  AgentBuiltInService,
  AgentConversationService,
  AgentEmployeeService,
  AgentSubAgentService,
} from '../../../server/agent/contracts.js';
import {
  getAccessibleAIEmployee,
  getSkillSettingsFromMain,
  updateMessageMetadata,
} from '../../sub-agents/shared.js';
import packageMetadata from '@nocobase/app-plugin-ai-employee/package.json' with { type: 'json' };

type DispatchContext = AgentContext<
  {
    aiEmployees: AIEmployeeRepository;
    aiConversations: AIConversationRepository;
    aiMessages: AIMessageRepository;
    aiToolMessages: AIToolMessageRepository;
  },
  {
    aiEmployees: AgentEmployeeService;
    aiConversations: AgentConversationService;
    builtIn: AgentBuiltInService;
    subAgents: AgentSubAgentService;
  }
>;

const isModelRef = (value: unknown): value is ModelRef =>
  !!value &&
  typeof value === 'object' &&
  typeof (value as Record<string, unknown>).llmService === 'string' &&
  typeof (value as Record<string, unknown>).model === 'string';

export default defineTools<DispatchContext>({
  scope: 'SPECIFIED',
  defaultPermission: 'ALLOW',
  introduction: {
    title: `{{t("AI employee task dispatching", { ns: "${packageMetadata.name}" })}}`,
    about: `{{t("Awaken and assign specific tasks to ai employees", { ns: "${packageMetadata.name}" })}}`,
  },
  definition: {
    name: 'dispatch-sub-agent-task',
    description:
      'Dispatch a question to a target AI employee and return the sub-session result.',
    schema: z.object({
      username: z.string().describe('The username of the target AI employee.'),
      question: z
        .string()
        .describe(
          'The question or task that should be executed by the target AI employee.',
        ),
    }),
  },
  async invoke(ctx, { username, question }, { toolCallId, writer }) {
    const sessionId = ctx.state.sessionId;
    const employee = await getAccessibleAIEmployee(ctx, username);
    if (!employee) throw new Error(`AI employee "${username}" not found`);
    const skillSettings = await getSkillSettingsFromMain(ctx, sessionId);
    const existedConversation =
      await ctx.services.aiConversations.resolveSubAgentConversation(
        sessionId,
        toolCallId,
      );
    let subSessionId = existedConversation?.sessionId;
    if (!subSessionId) {
      const newConversation = await ctx.services.aiConversations.create({
        userId: ctx.actor.id,
        aiEmployee: { username: employee.username },
        title: question.slice(0, 30),
        from: 'sub-agent',
        options: { skillSettings },
      });
      subSessionId = newConversation.sessionId;
    }
    if (!subSessionId)
      throw new Error('Sub-agent conversation did not return a session id');
    await updateMessageMetadata(
      ctx,
      toolCallId,
      subSessionId,
      'pending',
      sessionId,
    );
    const model = await ctx.services.aiEmployees.resolveModel(
      employee,
      isModelRef(ctx.state.model) ? ctx.state.model : undefined,
    );
    const answer = await ctx.services.subAgents.run({
      sessionId: subSessionId,
      employee,
      model,
      webSearch: ctx.state.webSearch,
      messages: ctx.state.messages,
      question,
      skillSettings: (skillSettings ?? undefined) as
        Record<string, unknown> | undefined,
      writer,
    });
    await updateMessageMetadata(
      ctx,
      toolCallId,
      subSessionId,
      'completed',
      sessionId,
    );
    return { sessionId: subSessionId, answer };
  },
});

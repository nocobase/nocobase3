import { defineTools } from '@nocobase/ai-employee';
import { z } from 'zod';
import { managerFactoryToken } from '../../../factory/manager-factory.js';
import { repositoryFactoryToken } from '../../../factory/repository-factory.js';
import {
  getAccessibleAIEmployee,
  getSkillSettingsFromMain,
  updateMessageMetadata,
} from '../../sub-agents/shared.js';

export default defineTools({
  scope: 'SPECIFIED',
  defaultPermission: 'ALLOW',
  i18n: { namespace: '@nocobase/app-plugin-ai-employee' },
  introduction: {
    title: 'Dispatch AI employee task',
    about: 'Assign a task to an AI employee and return the result.',
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
  dependencies: {
    repositories: repositoryFactoryToken,
    managers: managerFactoryToken,
  },
  async invoke(ctx, { username, question }, { toolCallId, writer }) {
    const { managers } = ctx.deps;
    const sessionId = ctx.state.sessionId;
    const employee = await getAccessibleAIEmployee(ctx, username);
    if (!employee) throw new Error(`AI employee "${username}" not found`);
    const skillSettings = await getSkillSettingsFromMain(ctx, sessionId);
    const existedConversation =
      sessionId && toolCallId
        ? await managers.aiConversationsManager.resolveSubAgentConversation(
            sessionId,
            toolCallId,
          )
        : null;
    let subSessionId = existedConversation?.sessionId;
    if (!subSessionId) {
      const newConversation = await managers.aiConversationsManager.create({
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
    const model = await managers.aiEmployeesManager.resolveModel(
      employee,
      ctx.state.model,
    );
    const answer = await managers.subAgentsDispatcher.run(
      {
        sessionId: subSessionId,
        employee,
        model,
        webSearch: ctx.state.webSearch,
        handoffMessages: ctx.state.handoffMessages,
        question,
        skillSettings: (skillSettings ?? undefined) as
          Record<string, unknown> | undefined,
        writer,
      },
      {
        actor: ctx.actor,
        // The sub-agent inherits this agent's turn; its own session and model
        // are decided when the sub-agent is created. The handoff messages ride
        // on the task, which is what reaches the sub-agent's conversation, so
        // they are not repeated here.
        turn: {
          frontendTools: ctx.state.frontendTools,
          toolCallResults: ctx.state.toolCallResults,
          timezone: ctx.state.timezone,
          important: ctx.state.important,
        },
        translate: ctx.translate,
        getHeader: ctx.getHeader,
      },
    );
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

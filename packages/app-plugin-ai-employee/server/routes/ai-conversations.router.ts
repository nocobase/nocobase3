import type { Hono } from 'hono';
import {
  chatAbort,
  chatCreate,
  chatDestroy,
  chatGetMessages,
  chatList,
  chatResendMessages,
  chatResumeStream,
  chatResumeToolCall,
  chatSendMessages,
  chatUnreadCounts,
  chatUpdate,
  chatUpdateOptions,
  chatUpdateToolArgs,
  chatUpdateUserDecision,
} from '../service/conversation-actions.js';
import {
  aiActionPath,
  createAIActionHandler,
  createAISSEActionHandler,
  objectBody,
  requiredString,
  sessionIdFromFilter,
} from './router-utils.js';

export function createAIConversationsRouter(
  app: Hono,
  apiBasePath: string,
): void {
  app.all(
    aiActionPath(apiBasePath, 'aiConversations:list'),
    createAIActionHandler('aiConversations:list', ({ ctx }) => chatList(ctx)),
  );

  app.all(
    aiActionPath(apiBasePath, 'aiConversations:unreadCounts'),
    createAIActionHandler('aiConversations:unreadCounts', ({ ctx }) =>
      chatUnreadCounts(ctx),
    ),
  );

  app.all(
    aiActionPath(apiBasePath, 'aiConversations:unreadCount'),
    createAIActionHandler(
      'aiConversations:unreadCount',
      async ({ ctx }) => (await chatUnreadCounts(ctx)).conversationUnreadCount,
    ),
  );

  app.all(
    aiActionPath(apiBasePath, 'aiConversations:getMessages'),
    createAIActionHandler('aiConversations:getMessages', ({ ctx }) =>
      chatGetMessages(ctx),
    ),
  );

  app.all(
    aiActionPath(apiBasePath, 'aiConversations:get'),
    createAIActionHandler('aiConversations:get', async ({ body, ctx, url }) => {
      const sessionId =
        url.searchParams.get('filterByTk') ??
        sessionIdFromFilter(url.searchParams.get('filter')) ??
        requiredString(objectBody(body).sessionId, 'sessionId');
      const conversation = await ctx.repositories.aiConversations.findOne({
        filter: { sessionId, userId: ctx.currentUser.id },
      });
      return {
        llmActiveState: conversation?.llmActiveState ?? 'idle',
      };
    }),
  );

  app.all(
    aiActionPath(apiBasePath, 'aiConversations:create'),
    createAIActionHandler('aiConversations:create', ({ ctx }) =>
      chatCreate(ctx),
    ),
  );

  app.all(
    aiActionPath(apiBasePath, 'aiConversations:update'),
    createAIActionHandler('aiConversations:update', ({ ctx }) =>
      chatUpdate(ctx),
    ),
  );

  app.all(
    aiActionPath(apiBasePath, 'aiConversations:updateOptions'),
    createAIActionHandler('aiConversations:updateOptions', ({ ctx }) =>
      chatUpdateOptions(ctx),
    ),
  );

  app.all(
    aiActionPath(apiBasePath, 'aiConversations:destroy'),
    createAIActionHandler('aiConversations:destroy', ({ ctx }) =>
      chatDestroy(ctx),
    ),
  );

  app.all(
    aiActionPath(apiBasePath, 'aiConversations:sendMessages'),
    createAISSEActionHandler('aiConversations:sendMessages', ({ ctx }) =>
      chatSendMessages(ctx),
    ),
  );

  app.all(
    aiActionPath(apiBasePath, 'aiConversations:resendMessages'),
    createAISSEActionHandler('aiConversations:resendMessages', ({ ctx }) =>
      chatResendMessages(ctx),
    ),
  );

  app.all(
    aiActionPath(apiBasePath, 'aiConversations:updateUserDecision'),
    createAIActionHandler('aiConversations:updateUserDecision', ({ ctx }) =>
      chatUpdateUserDecision(ctx),
    ),
  );

  app.all(
    aiActionPath(apiBasePath, 'aiConversations:resumeToolCall'),
    createAISSEActionHandler('aiConversations:resumeToolCall', ({ ctx }) =>
      chatResumeToolCall(ctx),
    ),
  );

  app.all(
    aiActionPath(apiBasePath, 'aiConversations:resumeStream'),
    createAISSEActionHandler('aiConversations:resumeStream', ({ ctx }) =>
      chatResumeStream(ctx),
    ),
  );

  app.all(
    aiActionPath(apiBasePath, 'aiConversations:abort'),
    createAIActionHandler('aiConversations:abort', ({ ctx }) => chatAbort(ctx)),
  );

  app.all(
    aiActionPath(apiBasePath, 'aiConversations:updateToolArgs'),
    createAIActionHandler('aiConversations:updateToolArgs', ({ ctx }) =>
      chatUpdateToolArgs(ctx),
    ),
  );
}

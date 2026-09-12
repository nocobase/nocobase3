import type { AgentRequest } from '../types.js';
import type { ConversationExecution } from '../contracts.js';

export function toAgentRequest(execution: ConversationExecution): AgentRequest {
  return {
    userMessages: execution.messages ? [...execution.messages] : undefined,
    messageId: execution.messageId,
    model: execution.model,
    signal: execution.abortSignal,
  };
}

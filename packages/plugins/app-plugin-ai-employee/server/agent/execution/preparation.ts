import type { AgentRequest, PreparedAgentContext } from '../types.js';

export type AgentPreparation = (
  request: AgentRequest,
) => Promise<PreparedAgentContext>;

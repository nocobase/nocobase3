import type { AIEmployeesManager } from '../../manager/ai-employees-manager.js';
import type { AgentAbortController, AgentAbortHandle } from '../types.js';

export class ConversationAbortController implements AgentAbortController {
  public constructor(
    private readonly manager: AIEmployeesManager,
    private readonly sessionId: string,
  ) {}

  public registerAbortHandle(token: symbol, handle: AgentAbortHandle): void {
    this.manager.registerAgentAbortHandle(this.sessionId, token, handle);
  }

  public unregisterAbortHandle(token: symbol): void {
    this.manager.unregisterAgentAbortHandle(this.sessionId, token);
  }
}

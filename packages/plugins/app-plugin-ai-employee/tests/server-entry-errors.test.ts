import { describe, expect, it } from 'vitest';
import {
  AgentServiceError,
  type AgentServiceErrorCode,
} from '../server/index.js';
import { AgentServiceError as InternalAgentServiceError } from '../server/agent/types.js';

describe('server entry', () => {
  it('exports the error an agent rejects with, so a caller can check it with instanceof', () => {
    const code: AgentServiceErrorCode = 'ABORTED';
    const error = new InternalAgentServiceError(code, 'aborted');

    expect(AgentServiceError).toBe(InternalAgentServiceError);
    expect(error).toBeInstanceOf(AgentServiceError);
    expect(error.code).toBe('ABORTED');
  });
});

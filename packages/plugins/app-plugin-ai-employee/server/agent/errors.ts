import { AgentServiceError } from './types.js';

export { AgentServiceError };

export function normalizeAgentError(
  error: unknown,
  fallbackMessage?: string,
): AgentServiceError {
  if (error instanceof AgentServiceError) return error;
  const cause = error as any;
  if (cause?.name === 'GraphRecursionError') {
    return new AgentServiceError(
      'GRAPH_RECURSION_ERROR',
      cause.message || fallbackMessage || 'Graph recursion limit reached',
      {
        cause: error,
        retryable: true,
      },
    );
  }
  if (cause?.name === 'AbortError' || cause?.code === 'ABORT_ERR') {
    return new AgentServiceError(
      'ABORTED',
      cause.message || fallbackMessage || 'Agent execution aborted',
      {
        cause: error,
        aborted: true,
      },
    );
  }
  return new AgentServiceError(
    'PROVIDER_ERROR',
    fallbackMessage || cause?.message || 'Agent execution failed',
    {
      cause: error,
    },
  );
}

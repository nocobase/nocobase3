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
    cause?.message || fallbackMessage || 'Agent execution failed',
    {
      cause: error,
    },
  );
}

/**
 * Classifies a failure raised while resolving the model, LLM service, or
 * provider. The execution phase decides the code, so no message matching is
 * involved and a new configuration failure needs no change here.
 */
export function toConfigurationError(error: unknown): AgentServiceError {
  if (error instanceof AgentServiceError) return error;
  const cause = error as { message?: string } | undefined;
  return new AgentServiceError(
    'CONFIGURATION_ERROR',
    cause?.message || 'Agent model configuration is unavailable',
    { cause: error },
  );
}

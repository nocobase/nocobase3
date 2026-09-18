export interface QueueDiagnosticLogger {
  warn(context: Record<string, unknown>, message: string): void;
  error(context: Record<string, unknown>, message: string): void;
}

/** Diagnostics are best-effort and must never change operation settlement. */
export function createQueueDiagnostics(
  logger?: QueueDiagnosticLogger,
): QueueDiagnosticLogger {
  function report(
    level: 'warn' | 'error',
    context: Record<string, unknown>,
    message: string,
  ): void {
    if (logger) {
      try {
        logger[level](context, message);
        return;
      } catch {
        // An injected logger failure must not hide the original diagnostic.
      }
    }
    try {
      console[level](message, context);
    } catch {
      // Even an unavailable fallback must not escape into queue operations.
    }
  }
  return {
    warn: (context, message): void => report('warn', context, message),
    error: (context, message): void => report('error', context, message),
  };
}

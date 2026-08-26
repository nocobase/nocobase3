import type { Context } from '../context.js';

export function sendSSEError(
  ctx: Pick<Context, 'res' | 'set' | 'status'>,
  error: Error | string,
  errorName?: string,
): void {
  const body =
    typeof error === 'string' ? error : error.message || 'Unknown error';
  if (!ctx.res.headersSent) {
    ctx.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    ctx.status = 200;
  }
  ctx.res.write(
    `data: ${JSON.stringify({ type: 'error', body, errorName })}\n\n`,
  );
  ctx.res.end();
}

export class ResourceActionError extends Error {
  constructor(
    readonly status: number,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ResourceActionError';
  }
}

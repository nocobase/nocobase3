const DEFAULT_CONTENT_TYPE = 'text/event-stream; charset=utf-8';

/** Writable stream target used by AI conversation SSE actions. */
export class SSEStreamTarget {
  private controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  readonly stream: ReadableStream<Uint8Array>;
  headersSent = false;
  private closed_ = false;
  private encoder = new TextEncoder();

  constructor() {
    this.stream = new ReadableStream<Uint8Array>({
      start: (controller) => {
        this.controller =
          controller as ReadableStreamDefaultController<Uint8Array>;
      },
    });
  }

  write(chunk: unknown): void {
    if (!this.controller || this.closed_) return;
    this.headersSent = true;
    try {
      this.controller.enqueue(
        this.encoder.encode(typeof chunk === 'string' ? chunk : String(chunk)),
      );
    } catch {
      // Ignore write-after-close.
    }
  }

  end(chunk?: unknown): void {
    if (chunk !== undefined) this.write(chunk);
    if (this.closed_) return;
    this.closed_ = true;
    try {
      this.controller?.close();
    } catch {
      // Ignore close-after-close.
    }
  }

  close(): void {
    this.end();
  }

  get destroyed(): boolean {
    return this.closed_;
  }

  get writableEnded(): boolean {
    return this.closed_;
  }
}

export function sseResponseHeaders(): Record<string, string> {
  return {
    'Content-Type': DEFAULT_CONTENT_TYPE,
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  };
}

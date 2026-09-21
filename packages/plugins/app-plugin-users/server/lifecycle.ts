import type { DatabaseConnection } from '@nocobase/db';

export interface UserLifecycleContext {
  readonly userId: string;
  readonly actorId?: string;
  readonly operation: 'disable' | 'delete';
  readonly connection: DatabaseConnection;
}
export interface UserLifecycleHandler {
  readonly key: string;
  readonly order?: number;
  before?(context: UserLifecycleContext): Promise<void>;
  after?(context: UserLifecycleContext): Promise<void>;
}
export class UserLifecycleError extends Error {
  constructor(readonly code: string, message: string, readonly status: 400 | 404 | 409 = 409) {
    super(message);
    this.name = 'UserLifecycleError';
  }
}
export class UserLifecycleRegistry {
  private readonly handlers = new Map<string, UserLifecycleHandler>();
  register(handler: UserLifecycleHandler): () => void {
    if (this.handlers.has(handler.key)) throw new Error(`User lifecycle already registered: ${handler.key}`);
    this.handlers.set(handler.key, handler);
    return () => { if (this.handlers.get(handler.key) === handler) this.handlers.delete(handler.key); };
  }
  async before(context: UserLifecycleContext): Promise<void> {
    for (const handler of this.list()) await handler.before?.(context);
  }
  async after(context: UserLifecycleContext): Promise<void> {
    for (const handler of this.list()) await handler.after?.(context);
  }
  private list(): UserLifecycleHandler[] {
    return [...this.handlers.values()].sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.key.localeCompare(b.key));
  }
}

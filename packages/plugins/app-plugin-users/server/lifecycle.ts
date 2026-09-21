import type { DatabaseConnection } from '@nocobase/db';

export type UserLifecycleOperation = 'disable' | 'delete';

export interface UserLifecycleContext {
  readonly userId: string;
  /** The authenticated operator, absent for system-initiated changes. */
  readonly actorId?: string;
  readonly operation: UserLifecycleOperation;
  /** The transaction the state change runs in; handlers must write through it. */
  readonly connection: DatabaseConnection;
}

/**
 * A plugin's participation in disabling or deleting a user. `before` runs after
 * the user row is locked and may reject the operation; `after` runs in the same
 * transaction once the status is written and performs the plugin's own cleanup.
 * Effects that must wait for the commit go through `connection.afterCommit`.
 */
export interface UserLifecycleHandler {
  readonly key: string;
  /** Lower runs first; ties fall back to the key. Defaults to 0. */
  readonly order?: number;
  before?(context: UserLifecycleContext): Promise<void>;
  after?(context: UserLifecycleContext): Promise<void>;
}

/** Whether an application allows user deletion and which participants it requires. */
export interface UserDeletionPolicy {
  readonly enabled: boolean;
  /** Lifecycle handler keys that must be registered before a deletion may run. */
  readonly requiredHandlers?: readonly string[];
}

export interface UsersDeletionConfig {
  readonly deletion?: UserDeletionPolicy;
}

export class UserLifecycleError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: 400 | 404 | 409 = 409,
  ) {
    super(message);
    this.name = 'UserLifecycleError';
  }
}

export class UserLifecycleRegistry {
  private readonly handlers = new Map<string, UserLifecycleHandler>();
  private policy: UserDeletionPolicy;

  constructor(policy: UserDeletionPolicy = { enabled: false }) {
    this.policy = policy;
  }

  register(handler: UserLifecycleHandler): () => void {
    if (this.handlers.has(handler.key)) {
      throw new Error(`User lifecycle already registered: ${handler.key}`);
    }
    this.handlers.set(handler.key, handler);
    return () => {
      if (this.handlers.get(handler.key) === handler) {
        this.handlers.delete(handler.key);
      }
    };
  }

  has(key: string): boolean {
    return this.handlers.has(key);
  }

  configureDeletion(policy: UserDeletionPolicy): void {
    this.policy = policy;
  }

  get deletionPolicy(): UserDeletionPolicy {
    return this.policy;
  }

  /** True when deletion is enabled and every required participant is registered. */
  deletionReady(): boolean {
    return (
      this.policy.enabled &&
      (this.policy.requiredHandlers ?? []).every((key) =>
        this.handlers.has(key),
      )
    );
  }

  assertDeletionReady(): void {
    if (this.deletionReady()) return;
    const missing = (this.policy.requiredHandlers ?? []).filter(
      (key) => !this.handlers.has(key),
    );
    throw new UserLifecycleError(
      'USER_DELETION_NOT_CONFIGURED',
      this.policy.enabled
        ? `User deletion requires lifecycle handlers that are not registered: ${missing.join(', ')}`
        : 'User deletion is not configured for this application.',
      409,
    );
  }

  async before(context: UserLifecycleContext): Promise<void> {
    for (const handler of this.list()) await handler.before?.(context);
  }

  async after(context: UserLifecycleContext): Promise<void> {
    for (const handler of this.list()) await handler.after?.(context);
  }

  private list(): UserLifecycleHandler[] {
    return [...this.handlers.values()].sort(
      (a, b) => (a.order ?? 0) - (b.order ?? 0) || a.key.localeCompare(b.key),
    );
  }
}

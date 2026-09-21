/** A committed transaction must never be retried because a notification failed. */
export class TransactionPostCommitError extends AggregateError {
  readonly committed: true = true;

  constructor(errors: readonly unknown[]) {
    super(errors, 'Transaction committed, but post-commit effects failed.');
    this.name = 'TransactionPostCommitError';
  }
}

/** One collector per savepoint; successful children transfer effects to their parent. */
export class TransactionCompletion {
  private readonly effects: Array<() => void | Promise<void>> = [];
  private finished = false;

  add(effect: () => void | Promise<void>): void {
    if (this.finished) throw new Error('Transaction has already completed.');
    this.effects.push(effect);
  }

  rollback(): void {
    this.finished = true;
    this.effects.length = 0;
  }

  async commit(parent?: TransactionCompletion): Promise<void> {
    this.finished = true;
    const effects = this.effects.splice(0);
    if (parent) {
      for (const effect of effects) parent.add(effect);
      return;
    }
    const failures: unknown[] = [];
    for (const effect of effects) {
      try {
        await effect();
      } catch (error) {
        failures.push(error);
      }
    }
    if (failures.length) throw new TransactionPostCommitError(failures);
  }
}

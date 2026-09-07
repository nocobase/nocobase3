export interface CouplingCleanupStep {
  readonly name: string;
  readonly run: () => unknown | Promise<unknown>;
  readonly timeoutMs?: number;
}

/** A timeout bounds waiting, not execution; only fixture-owned gates/sockets may be released. */
export async function runCouplingCleanup(
  steps: readonly CouplingCleanupStep[],
  timeoutMs: number = 3000,
): Promise<void> {
  const errors: Error[] = [];
  for (const step of steps) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        Promise.resolve().then(step.run),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(
            () => reject(new Error('Cleanup deadline exceeded.')),
            step.timeoutMs ?? timeoutMs,
          );
        }),
      ]);
    } catch (cause) {
      errors.push(new Error('cleanup failed: ' + step.name, { cause }));
    } finally {
      clearTimeout(timer);
    }
  }
  if (errors.length) throw new AggregateError(errors, 'teardown failed.');
}

/** Allow every nested fixture cleanup its own deadline even after request drain fails. */
export async function finishCouplingFixture(
  pending: readonly (Promise<unknown> | undefined)[],
  close: () => Promise<void>,
  originalFailure?: unknown,
): Promise<void> {
  try {
    await runCouplingCleanup([
      {
        name: 'request drain',
        run: async () => {
          const results = await Promise.allSettled(pending);
          const errors = results
            .filter((result) => result.status === 'rejected')
            .map((result) => result.reason as unknown);
          if (errors.length)
            throw new AggregateError(errors, 'pending requests failed.');
        },
      },
      // Leave room for the fixture resource chain and optional transport cleanup.
      { name: 'fixture close', run: close, timeoutMs: 25000 },
    ]);
  } catch (cleanupError) {
    throw new AggregateError(
      originalFailure === undefined
        ? [cleanupError]
        : [originalFailure, cleanupError],
      'test teardown failed.',
      { cause: cleanupError },
    );
  }
}

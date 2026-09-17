/** Rejects legacy declarations even when callers bypass defineServerPlugin. */
export function assertNoQueueContribution(definition: {
  readonly packageName: string;
  readonly queue?: unknown;
}): void {
  if (definition.queue !== undefined) {
    throw new Error(
      `Server plugin "${definition.packageName}" queue.jobs is retired; register QueueService handlers through a service provider.`,
    );
  }
}

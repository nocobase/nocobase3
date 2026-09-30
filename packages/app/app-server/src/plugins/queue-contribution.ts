/**
 * Describes a retired `queue.jobs` declaration, or returns undefined when there is none.
 *
 * The declaration is ignored rather than rejected, so an application still starts when one of its installed plugins
 * was built against the earlier contract; the Application logs this message once per plugin when it starts.
 */
export function legacyQueueContributionWarning(definition: {
  readonly packageName: string;
  readonly queue?: unknown;
}): string | undefined {
  if (definition.queue === undefined) return undefined;
  return `Server plugin "${definition.packageName}" declares queue.jobs, which is retired and ignored: the jobs it lists are no longer discovered or run. Register job classes on a JobExecutor from @nocobase/jobs, or QueueService handlers, in a service provider, and remove the queue declaration.`;
}

import { findAppProject, type AppProject } from './app-project.ts';
import {
  HubApiError,
  HubProtocolError,
  type ApplicationSummary,
  type Deployment,
  type HubClient,
  type Release,
} from './hub-client.ts';

export interface RemoteApplicationContext {
  readonly hub: string;
  readonly applicationReference?: string;
  readonly project?: AppProject;
}

export async function resolveRemoteApplicationContext(input: {
  readonly directory?: string;
  readonly hub?: string;
  readonly application?: string;
}): Promise<RemoteApplicationContext> {
  const project = await findAppProject(input.directory ?? process.cwd());
  const hub = input.hub ?? project?.config.hub;
  if (!hub) {
    throw new Error(
      'No Hub was specified. Pass --hub <url> or run the command inside a pulled app.',
    );
  }
  const applicationReference =
    input.application ?? project?.config.applicationId ?? project?.config.slug;
  return { hub, applicationReference, project };
}

export async function resolveApplication(
  client: HubClient,
  reference: string | undefined,
): Promise<ApplicationSummary> {
  if (!reference) {
    throw new Error(
      'No app was specified. Pass --app <slug> or run the command inside a pulled app.',
    );
  }
  try {
    return await client.getApplication(reference);
  } catch (error) {
    if (!(error instanceof HubApiError) || error.status !== 404) throw error;
  }
  const page = await client.listApplications({ query: reference, limit: 100 });
  const matches = page.items.filter(
    (application) =>
      application.id === reference || application.slug === reference,
  );
  if (matches.length === 1) return matches[0];
  throw new HubApiError(`Application "${reference}" was not found.`, {
    code: 'APPLICATION_NOT_FOUND',
    status: 404,
  });
}

export function resolveRelease(
  releases: readonly Release[],
  reference: string,
): Release {
  const matches = releases.filter(
    (release) => release.id === reference || release.version === reference,
  );
  if (matches.length === 1) return matches[0];
  throw new HubApiError(`Release "${reference}" was not found.`, {
    code: 'RELEASE_NOT_FOUND',
    status: 404,
  });
}

export async function listAllReleases(
  client: HubClient,
  applicationId: string,
): Promise<Release[]> {
  const limit = 100;
  const releases: Release[] = [];
  const seenIds = new Set<string>();
  for (let offset = 0; ; offset += limit) {
    const page = await client.listReleases(applicationId, { limit, offset });
    if (
      page.length === limit &&
      page.every((release) => seenIds.has(release.id))
    ) {
      throw new HubProtocolError(
        'Hub returned a repeated Release page while paginating.',
      );
    }
    releases.push(...page);
    for (const release of page) seenIds.add(release.id);
    if (page.length < limit) return releases;
  }
}

export async function waitForDeployment(
  client: HubClient,
  deployment: Deployment,
  options: {
    readonly pollIntervalMs?: number;
    readonly timeoutMs?: number;
  } = {},
): Promise<Deployment> {
  let current = deployment;
  const deadline = Date.now() + (options.timeoutMs ?? 10 * 60_000);
  while (!isTerminalDeployment(current)) {
    if (Date.now() >= deadline) {
      throw new HubApiError(
        `Deployment "${current.id}" did not finish before the timeout.`,
        { code: 'DEPLOYMENT_POLL_TIMEOUT', status: 503, retryable: true },
      );
    }
    await wait(options.pollIntervalMs ?? 1_000);
    current = await client.getDeployment(current.id);
  }
  if (current.status === 'failed' || current.status === 'cancelled') {
    const failure = isFailure(current.failure) ? current.failure : undefined;
    throw new HubApiError(
      failure?.message ?? `Deployment "${current.id}" ${current.status}.`,
      {
        code:
          failure?.code ??
          (current.status === 'cancelled'
            ? 'DEPLOYMENT_CANCELLED'
            : 'DEPLOYMENT_FAILED'),
        status: 409,
      },
    );
  }
  return current;
}

function isTerminalDeployment(deployment: Deployment): boolean {
  return ['succeeded', 'failed', 'cancelled'].includes(deployment.status);
}

function isFailure(
  value: unknown,
): value is { readonly code: string; readonly message: string } {
  return Boolean(
    value &&
    typeof value === 'object' &&
    typeof (value as { code?: unknown }).code === 'string' &&
    typeof (value as { message?: unknown }).message === 'string',
  );
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

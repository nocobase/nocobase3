import type { AppAuthorization } from './authorization.js';

/**
 * Every stored composite grant that no longer expands against the current
 * composite definitions, one message naming its Permission Set, resource,
 * action and problem.
 */
export async function storedGrantProblems(
  authz: AppAuthorization,
): Promise<string[]> {
  const sets = await authz.permissionSets.list();
  return sets.flatMap((set) =>
    set.grants.flatMap((grant) =>
      grant.actions.flatMap((action) => {
        const reason = authz.composites.validateGrant({
          resource: grant.resource,
          action: action.action,
          ...(action.policy === undefined ? {} : { policy: action.policy }),
        });
        return reason === undefined
          ? []
          : [
              `Permission set ${set.key} grants ${grant.resource.type}:${grant.resource.id}.${action.action}, which no longer applies: ${reason}`,
            ];
      }),
    ),
  );
}

export interface StoredGrantReportOptions {
  /** Warn instead of throwing. */
  production: boolean;
  warn(message: string): void;
}

/** Throws in development and warns in production, as the workspace check does. */
export function reportStoredGrants(
  problems: readonly string[],
  options: StoredGrantReportOptions,
): void {
  if (!problems.length) return;
  if (!options.production)
    throw new Error(
      `Authorization has invalid stored grants:\n- ${problems.join('\n- ')}`,
    );
  for (const problem of problems) options.warn(`Authorization: ${problem}`);
}

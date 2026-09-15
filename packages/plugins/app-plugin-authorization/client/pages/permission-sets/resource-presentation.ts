import type { ReactElement } from 'react';

import type { AuthorizationOptions } from '../../authorization-client.js';
import type { Translate } from '../../i18n.js';
import type { GrantMark } from './labels.js';
import type { GrantDraft } from './types.js';

/** What the side panel hands a resource type when it reports one action. */
export interface GrantActionDetailsProps {
  readonly options: AuthorizationOptions;
  readonly grant: GrantDraft;
  readonly action: string;
}

/**
 * How one resource type's grants read, contributed by whoever owns that type.
 *
 * Resource types are registered at runtime, so the settings table renders what
 * it is given and names none of them. A type contributing nothing still renders
 * correctly: its summary cell is empty and a granted action reaches the whole
 * resource.
 */
export interface ResourceTypePresentation {
  /** The summary cell for one grant. */
  readonly summary?: (
    t: Translate,
    options: AuthorizationOptions,
    grant: GrantDraft,
  ) => string;
  /** What one granted action reaches, when the type narrows it. */
  readonly mark?: (grant: GrantDraft, action: string) => GrantMark;
  /** What the side panel adds under one granted action. */
  readonly actionDetails?: (props: GrantActionDetailsProps) => ReactElement;
}

const presentations = new Map<string, ResourceTypePresentation>();

export function registerResourceTypePresentation(
  type: string,
  presentation: ResourceTypePresentation,
): void {
  presentations.set(type, presentation);
}

export function resourceTypePresentation(
  type: string,
): ResourceTypePresentation | undefined {
  return presentations.get(type);
}

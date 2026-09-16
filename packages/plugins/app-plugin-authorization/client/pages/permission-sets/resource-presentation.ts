import type { GrantMark } from './labels.js';
import type { GrantDraft } from './types.js';

export interface ResourceTypePresentation {
  readonly mark?: (grant: GrantDraft, action: string) => GrantMark;
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

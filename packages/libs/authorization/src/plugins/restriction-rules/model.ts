import type { AuthorizationTitle } from '../../core/titles.js';
import type { AuthorizationSubject } from '../../core/types.js';
import type { DefaultAccessRule } from '../default-access/model.js';

/** Narrows what the listed subjects reach; intersects every other source. */
export interface RestrictionRule extends DefaultAccessRule {
  title?: AuthorizationTitle;
  subjects: readonly AuthorizationSubject[];
  reason?: string;
}

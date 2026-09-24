import type { AuthorizationTitle } from '../../core/titles.js';
import type { AuthorizationSubject } from '../../core/types.js';
import type { DefaultAccessRule } from '../default-access/model.js';

/** Extra records for the listed subjects. Never selects all records. */
export interface SharingRule extends DefaultAccessRule {
  title?: AuthorizationTitle;
  subjects: readonly AuthorizationSubject[];
  reason?: string;
}

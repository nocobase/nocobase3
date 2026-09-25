import type { AuthorizationContext } from '@nocobase/authorization/core';
import type { OptionText } from './i18n.js';

export interface SubjectOption {
  id: string;
  title: string;
  description?: string;
}

export interface SubjectSelectionContext {
  authz: AuthorizationContext;
}

/** One page of a subject's members, `page` counting from 1. */
export interface SubjectMembersQuery {
  search?: string;
  page: number;
  pageSize: number;
}

export interface SubjectAdministration {
  title: OptionText;
  selection:
    | { type: 'fixed'; id: string }
    | {
        type: 'collection';
        list(
          query: { search?: string; page: number; pageSize: number },
          context: SubjectSelectionContext,
        ): Promise<{ items: readonly SubjectOption[]; total: number }>;
        resolve(
          ids: readonly string[],
          context: SubjectSelectionContext,
        ): Promise<readonly SubjectOption[]>;
      };
  /**
   * The users the subject contains, read-only, as `{ id, title, description? }`
   * of each user. A hierarchical subject such as a department answers its
   * effective members: its direct members and those of its descendants.
   */
  members?(
    id: string,
    query: SubjectMembersQuery,
    context: SubjectSelectionContext,
  ): Promise<{ items: readonly SubjectOption[]; total: number }>;
  /**
   * Where the subject is managed: an application-relative path including
   * `/settings`, without the deployment base path. `undefined` offers no link.
   */
  manage?(id: string): string | undefined;
}

declare module '@nocobase/authorization/core' {
  interface AuthorizationSubjectTypeExtensions {
    administration?: SubjectAdministration;
  }
}

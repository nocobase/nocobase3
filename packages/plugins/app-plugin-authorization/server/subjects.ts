import type { AuthorizationScope } from '@nocobase/authorization/core';
import type { OptionText } from './i18n.js';

export interface SubjectOption {
  id: string;
  title: string;
  description?: string;
}

export interface SubjectSelectionContext {
  authz: AuthorizationScope;
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
}

declare module '@nocobase/authorization/core' {
  interface AuthorizationSubjectTypeExtensions {
    administration?: SubjectAdministration;
  }
}

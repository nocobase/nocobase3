import type {
  CollectionFilter,
  CollectionQuery,
  CollectionRepository,
  RepositoryOptions,
} from '@nocobase/ai-employee';
import type { AIEmployeeEntity } from '@nocobase/ai-employee';

export type AIConversationEntity = {
  id?: string | number | bigint;
  sessionId?: string;
  thread?: number;
  topicId?: string;
  from?: string;
  scope?: string;
  userId?: string | number | bigint;
  aiEmployeeUsername?: string;
  aiEmployee?: Partial<AIEmployeeEntity>;
  title?: string;
  options?: Record<string, unknown>;
  llmActiveState?: string;
  category?: string;
  read?: boolean;
  createdAt?: Date | string;
  updatedAt?: Date | string;
};

export type AIConversationListFilter = Omit<
  CollectionFilter<AIConversationEntity>,
  'title'
> & {
  title?:
    CollectionFilter<AIConversationEntity>['title'] | { $includes: string };
};

export type AIConversationListQuery = Omit<
  CollectionQuery<AIConversationEntity>,
  'filter'
> & {
  filter?: AIConversationListFilter;
};

export interface AIConversationRepository extends CollectionRepository<AIConversationEntity> {
  find(
    query?: AIConversationListQuery,
    options?: RepositoryOptions,
  ): Promise<AIConversationEntity[]>;
  count(
    query?: Pick<AIConversationListQuery, 'filter'>,
    options?: RepositoryOptions,
  ): Promise<number>;
}

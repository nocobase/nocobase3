import type { CollectionRepository } from '@nocobase/ai-employee';

export type AIFileSource = {
  dataSourceKey?: string;
  collectionName?: string;
  field?: string;
  documentCache?: boolean;
  trustworthy?: boolean;
};

export type AIFileEntity = {
  id?: string | number | bigint;
  title?: string;
  filename?: string;
  extname?: string;
  size?: number;
  mimetype?: string;
  path?: string;
  url?: string;
  preview?: string;
  storageId?: string | number;
  meta?: Record<string, unknown>;
  createdById?: string | number | bigint;
  createdAt?: Date | string;
  updatedAt?: Date | string;
};

export type AIFileAttachment = Omit<
  AIFileEntity,
  'id' | 'storageId' | 'createdById' | 'createdAt' | 'updatedAt'
> & {
  id?: string | number;
  storageId?: string | number;
  source?: AIFileSource;
};

export interface AIFileRepository extends CollectionRepository<AIFileEntity> {}

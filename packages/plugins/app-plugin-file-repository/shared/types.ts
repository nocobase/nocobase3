import type { CreatedTargetReference } from '@nocobase/db';
export interface FileRecord {
  id: string;
  disk: string;
  key: string;
  filename: string;
  ext: string;
  mimeType: string;
  size: number;
  createdAt: Date | string;
  updatedAt: Date | string;
  /** Present when the selected record includes id and ext. Never persisted. */
  contentUrl?: string;
}

export interface UploadOneInput {
  readonly file: File;
}
export interface UploadManyInput {
  readonly files: readonly File[];
}
export interface UploadOneResult {
  readonly record: FileRecord;
  readonly createdTargets: readonly CreatedTargetReference[];
  readonly version?: string | number;
}
export interface UploadManyResult {
  readonly createdCount: number;
  readonly records: readonly FileRecord[];
}

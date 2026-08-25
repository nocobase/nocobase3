export type StorageDriver = 'fs' | 's3';

export type StorageVisibility = 'public' | 'private';

export interface StorageSettingsDraft {
  name: string;
  driver: StorageDriver;
  visibility: StorageVisibility;
  isDefault: boolean;
  localPath: string;
  publicUrl: string;
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
  supportsAcl: boolean;
}

export interface StorageSettingsRecord extends Omit<
  StorageSettingsDraft,
  'accessKeyId' | 'secretAccessKey'
> {
  appId: string;
  moduleId: 'file-storage';
  credentialsEncrypted: string | null;
  configVersion: number;
  status: 'saved';
  applyStatus: 'pending-runtime-apply';
  updatedAt: string;
  updatedBy: SettingsActor;
}

export interface StorageSettingsPublic extends Omit<
  StorageSettingsDraft,
  'secretAccessKey' | 'accessKeyId'
> {
  appId: string;
  moduleId: 'file-storage';
  accessKeyId: string;
  accessKeyIdConfigured: boolean;
  secretAccessKey: '';
  secretConfigured: boolean;
  configVersion: number;
  status: 'saved';
  applyStatus: 'pending-runtime-apply';
  updatedAt: string;
  updatedBy: SettingsActor;
}

export interface SettingsActor {
  id: string;
  name: string;
  role: string;
}

export interface SettingsAuditRecord {
  id: string;
  appId: string;
  moduleId: string;
  action: 'read' | 'save' | 'test';
  status: 'succeeded' | 'failed';
  actor: SettingsActor;
  at: string;
  errorCode?: string;
}

export interface SettingsStoreFile {
  schemaVersion: 1;
  storage: StorageSettingsRecord[];
  audit: SettingsAuditRecord[];
}

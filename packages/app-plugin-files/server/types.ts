import type { Context, Hono } from 'hono';

export interface FileService {
  createFileRoute(options: CreateFileRouteOptions): Hono;
}

export interface CreateFileRouteOptions {
  binding: FileFieldBinding | FileRelationBinding;
  constraints?: FileConstraints;
  authorize(input: FileRouteAuthorizationInput): void | Promise<void>;
  publicAccess?: boolean;
}

export interface FileRouteAuthorizationInput {
  context: Context;
  action: 'read' | 'write' | 'share';
  recordId: string;
  fileId?: string;
}

export interface FileFieldBinding {
  type: 'field';
  collection: string;
  recordParam: string;
  fileField: string;
  recordKey?: string;
}

export interface FileRelationBinding {
  type: 'relation';
  collection: string;
  recordParam: string;
  recordField: string;
  maxFiles: number;
}

export interface FileConstraints {
  maxBytes?: number;
  allowedExtensions?: readonly string[];
  allowedContentTypes?: readonly string[];
}

import type { NotificationProvider } from '@refinedev/core';
import { normalizeKnowledgeBaseError } from '@/extensions/nocobase-ai-knowledge-base-providers';

type NotificationOpen = NotificationProvider['open'] | undefined;

export function notifyKnowledgeBaseMutationError(
  notify: NotificationOpen,
  title: string,
  error: unknown,
  fallback: string,
) {
  notify?.({
    type: 'error',
    message: title,
    description: normalizeKnowledgeBaseError(error, fallback).message,
  });
}

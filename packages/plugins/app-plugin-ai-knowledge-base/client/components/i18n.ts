import '../locales/index.js';
import { useTranslate } from '@refinedev/core';
import { useCallback } from 'react';

const namespace = 'nocobase-ai-knowledge-base';

export function useKnowledgeBaseComponentTranslate() {
  const translate = useTranslate();

  return useCallback(
    (key: string, options: Record<string, unknown> = {}) =>
      translate(key, { ...options, ns: namespace }, key),
    [translate],
  );
}

import { createContext, useContext, type ReactNode } from 'react';
import { knowledgeBaseService } from './service/index.js';
import type { KnowledgeBaseService } from './service/knowledge-base.js';

const KnowledgeBaseServiceContext =
  createContext<KnowledgeBaseService>(knowledgeBaseService);

/**
 * The Knowledge base workspace uses the permission-guide-compliant NocoBase resource-client
 * implementation by default. Applications may provide this context to replace it
 * with a version-locked proxy or a test service without changing the UI routes.
 */
export function KnowledgeBaseServiceProvider({
  service,
  children,
}: {
  service: KnowledgeBaseService;
  children: ReactNode;
}) {
  return (
    <KnowledgeBaseServiceContext.Provider value={service}>
      {children}
    </KnowledgeBaseServiceContext.Provider>
  );
}

export function useKnowledgeBaseService() {
  return useContext(KnowledgeBaseServiceContext);
}

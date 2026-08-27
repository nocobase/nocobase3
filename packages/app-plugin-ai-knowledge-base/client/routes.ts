import {
  defineClientRoutes,
  type AppClientRouteDefinition,
} from '@nocobase/app-client/plugins';
import type { ComponentType } from 'react';
import { withAISettingsShell } from './ai-settings-shell.js';

const withShell = async (
  loader: () => Promise<{ default: ComponentType }>,
): Promise<{ default: ComponentType }> => {
  const module = await loader();
  return { default: withAISettingsShell(module.default) };
};

const routes: readonly AppClientRouteDefinition[] = defineClientRoutes([
  {
    name: 'ai-knowledge-base',
    path: '/ai/knowledge-base',
    auth: 'required',
    componentLoader: () =>
      withShell(() => import('./page/knowledge-bases-page.js')),
  },
  {
    name: 'ai-knowledge-base-vectors',
    path: '/ai/vector-database',
    auth: 'required',
    componentLoader: () =>
      withShell(() => import('./page/vector-databases-page.js')),
  },
  {
    name: 'ai-knowledge-base-workspace',
    path: '/ai/knowledge-base/:knowledgeBaseKey',
    auth: 'required',
    componentLoader: () => withShell(() => import('./page/workspace-route.js')),
  },
  {
    name: 'ai-knowledge-base-document',
    path: '/ai/knowledge-base/:knowledgeBaseKey/documents/:documentId',
    auth: 'required',
    componentLoader: () => withShell(() => import('./page/document-page.js')),
  },
  {
    name: 'ai-knowledge-base-segment',
    path: '/ai/knowledge-base/:knowledgeBaseKey/documents/:documentId/segments/:segmentUid',
    auth: 'required',
    componentLoader: () =>
      withShell(() => import('./page/segment-route-entry.js')),
  },
  {
    name: 'ai-knowledge-base-upload',
    path: '/ai/knowledge-base/:knowledgeBaseKey/upload',
    auth: 'required',
    componentLoader: () =>
      withShell(() => import('./page/upload-controller.js')),
  },
  {
    name: 'ai-knowledge-base-retrieval',
    path: '/ai/knowledge-base/:knowledgeBaseKey/retrieval/:resultIndex',
    auth: 'required',
    componentLoader: () =>
      withShell(() => import('./page/retrieval-result-route-entry.js')),
  },
]);
export default routes;

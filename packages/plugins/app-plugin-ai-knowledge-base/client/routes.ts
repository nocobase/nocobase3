import {
  defineDevRoutes,
  type AppClientRouteComponentLoader,
} from '@nocobase/app-client/plugins';
import { BookOpen } from 'lucide-react';

function createDemoLoader(
  exportName:
    | 'KnowledgeBasesDemoPage'
    | 'DocumentsDemoPage'
    | 'DocumentUploadDemoPage'
    | 'SegmentsDemoPage'
    | 'HitTestsDemoPage',
): AppClientRouteComponentLoader {
  return async () => {
    const pages = await import('./dev/demo-pages.js');
    return { default: pages[exportName] };
  };
}

const workspaceLoader: AppClientRouteComponentLoader = async () =>
  import('./dev/workspace-router.js');

export default defineDevRoutes([
  {
    name: 'ai-knowledge-base',
    path: '/ai-knowledge-base',
    navigation: { title: 'AI Knowledge Base', icon: BookOpen },
    children: [
      {
        name: 'ai-knowledge-base-directory',
        path: '/',
        navigation: { title: 'Knowledge bases' },
        componentLoader: createDemoLoader('KnowledgeBasesDemoPage'),
      },
      {
        name: 'ai-knowledge-base-documents',
        path: '/documents',
        navigation: { title: 'Documents' },
        componentLoader: createDemoLoader('DocumentsDemoPage'),
      },
      {
        name: 'ai-knowledge-base-upload',
        path: '/upload',
        navigation: { title: 'Document upload' },
        componentLoader: createDemoLoader('DocumentUploadDemoPage'),
      },
      {
        name: 'ai-knowledge-base-segments',
        path: '/segments',
        navigation: { title: 'Segments' },
        componentLoader: createDemoLoader('SegmentsDemoPage'),
      },
      {
        name: 'ai-knowledge-base-hit-tests',
        path: '/hit-tests',
        navigation: { title: 'Hit tests' },
        componentLoader: createDemoLoader('HitTestsDemoPage'),
      },
      {
        name: 'ai-knowledge-base-workspace',
        path: '/workspace',
        navigation: { title: 'Knowledge base workspace' },
        componentLoader: workspaceLoader,
      },
    ],
  },
]);

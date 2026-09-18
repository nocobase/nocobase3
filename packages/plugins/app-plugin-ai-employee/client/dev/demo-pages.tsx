/// <reference path="../../types/client-dev-node-resolution.d.ts" />

import { PageContainer } from '../components/page-container.js';
import type { ComponentType, ReactElement } from 'react';

import { AIChatPage } from './demo/index.js';
import { FloatingChatPage } from './demo/floating.js';
import { PageContextPage } from './demo/page-context.js';
import { ShortcutPage } from './demo/shortcut.js';
import { ToolCardsPage } from './demo/tool-cards.js';
import { NocoBaseAIRootProvider } from '../../registry/nocobase-ai/components/index.js';

function withDemoRoot(Page: ComponentType): () => ReactElement {
  return function AIEmployeeDemoPage(): ReactElement {
    return (
      <NocoBaseAIRootProvider>
        <PageContainer className='@container/main'>
          <Page />
        </PageContainer>
      </NocoBaseAIRootProvider>
    );
  };
}

export const AIChatDemoPage = withDemoRoot(AIChatPage);
export const FloatingChatDemoPage = withDemoRoot(FloatingChatPage);
export const AIEmployeeTasksDemoPage = withDemoRoot(ShortcutPage);
export const PageContextDemoPage = withDemoRoot(PageContextPage);
export const ToolCardsDemoPage = withDemoRoot(ToolCardsPage);

import { appApiClientToken, useService } from '@nocobase/app-client';
import { useMemo } from 'react';

import { AIProvider, type AIProviderProps } from '../providers/ai-provider.js';
import { NocoBaseAIService } from '../services/index.js';
import { AIPageElementProvider } from './page-elements/page-element-provider.js';
import {
  AIToolRendererProvider,
  type AIToolRendererMap,
} from './tools/tool-renderer-provider.js';
import type { AIPageContextFailurePolicy } from './page-elements/page-element-provider.js';

export type NocoBaseAIRootProviderProps = AIProviderProps & {
  toolRenderers?: AIToolRendererMap;
  contextFailurePolicy?: AIPageContextFailurePolicy;
};

export function NocoBaseAIRootProvider({
  children,
  toolRenderers,
  contextFailurePolicy,
  service: providedService,
  ...aiProviderProps
}: NocoBaseAIRootProviderProps) {
  const appClient = useService(appApiClientToken);
  const service = useMemo(
    () => providedService ?? new NocoBaseAIService(appClient),
    [appClient, providedService],
  );
  return (
    <AIProvider {...aiProviderProps} service={service}>
      <AIToolRendererProvider renderers={toolRenderers}>
        <AIPageElementProvider contextFailurePolicy={contextFailurePolicy}>
          {children}
        </AIPageElementProvider>
      </AIToolRendererProvider>
    </AIProvider>
  );
}

import { AIProvider, type AIProviderProps } from '../providers/ai-provider.js';
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
  ...aiProviderProps
}: NocoBaseAIRootProviderProps) {
  return (
    <AIProvider {...aiProviderProps}>
      <AIToolRendererProvider renderers={toolRenderers}>
        <AIPageElementProvider contextFailurePolicy={contextFailurePolicy}>
          {children}
        </AIPageElementProvider>
      </AIToolRendererProvider>
    </AIProvider>
  );
}

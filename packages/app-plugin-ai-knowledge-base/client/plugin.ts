import {
  defineClientPlugin,
  type AppClientPluginFactory,
} from '@nocobase/app-client/plugins';
import './register-settings.js';

export interface AIKnowledgeBaseClientOptions {
  readonly placeholder?: never;
}

const aiKnowledgeBase: AppClientPluginFactory<AIKnowledgeBaseClientOptions> =
  defineClientPlugin({
    packageName: '@nocobase/app-plugin-ai-knowledge-base',
    bootstrap: () => import('./bootstrap.js'),
  });

export default aiKnowledgeBase;

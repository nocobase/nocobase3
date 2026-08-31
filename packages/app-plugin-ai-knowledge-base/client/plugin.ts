import {
  defineClientPlugin,
  type AppClientPluginFactory,
} from '@nocobase/app-client/plugins';
import './locales/index.js';
import './register-settings.js';
import routes from './routes.js';

export interface AIKnowledgeBaseClientOptions {
  readonly placeholder?: never;
}

const aiKnowledgeBase: AppClientPluginFactory<AIKnowledgeBaseClientOptions> =
  defineClientPlugin({
    packageName: '@nocobase/app-plugin-ai-knowledge-base',
    routes,
  });

export default aiKnowledgeBase;

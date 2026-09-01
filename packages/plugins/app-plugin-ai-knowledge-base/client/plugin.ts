import {
  defineClientPlugin,
  type AppClientPluginFactory,
} from '@nocobase/app-client/plugins';
import './register-settings.js';
import locales from './locales/index.js';
import routes from './routes.js';

export interface AIKnowledgeBaseClientOptions {
  readonly placeholder?: never;
}

const aiKnowledgeBase: AppClientPluginFactory<AIKnowledgeBaseClientOptions> =
  defineClientPlugin({
    packageName: '@nocobase/app-plugin-ai-knowledge-base',
    locales,
    routes,
  });

export default aiKnowledgeBase;

import type { AppClientPluginBootstrap } from '@nocobase/app-client/plugins';

const bootstrap: AppClientPluginBootstrap = ({ routes }) => {
  routes.add({
    name: 'index',
    path: '/routes-example',
    componentLoader: () => import('./pages/routes-example-page.js'),
  });
};

export default bootstrap;

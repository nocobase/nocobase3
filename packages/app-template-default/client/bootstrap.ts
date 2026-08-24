import type { AppClientBootstrap } from '@nocobase/app-client/plugins';

const bootstrap: AppClientBootstrap = ({ refine }) => {
  refine.setOptions({
    title: {
      text: 'NocoBase',
    },
  });
};

export default bootstrap;

import type { AppClientPluginBootstrap } from '@nocobase/app-client/plugins';

import type { AuditLogClientOptions } from './plugin.js';

const bootstrap: AppClientPluginBootstrap<AuditLogClientOptions> = ({
  refine,
  options,
}) => {
  refine.addResources([
    {
      name: 'audit-log',
      list: '/audit-log',
      meta: {
        label: options.resourceLabel ?? 'Audit Log App Plugin',
      },
    },
  ]);
};

export default bootstrap;

import { applicationsEnUS } from './resources/applications.js';
import type { ApplicationsResource } from './resources/applications.js';
import { membersEnUS } from './resources/members.js';
import type { MembersResource } from './resources/members.js';
import { operationsEnUS } from './resources/operations.js';
import type { OperationsResource } from './resources/operations.js';

interface NavigationResource {
  readonly navigation: {
    readonly applications: string;
    readonly deployments: string;
    readonly audit: string;
    readonly members: string;
  };
}

/**
 * The shape shared by every locale published by this plugin.
 */
export type HubResource = NavigationResource &
  ApplicationsResource &
  OperationsResource &
  MembersResource;

const enUS: HubResource = {
  navigation: {
    applications: 'Applications',
    deployments: 'Deployments',
    audit: 'Audit log',
    members: 'Members and roles',
  },
  ...applicationsEnUS,
  ...operationsEnUS,
  ...membersEnUS,
};

export default enUS;

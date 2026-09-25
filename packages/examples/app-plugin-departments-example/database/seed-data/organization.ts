import { recordAccess } from '@nocobase/app-plugin-authorization/server';
import {
  definePermissionSet,
  type PermissionSet,
} from '@nocobase/authorization/permission-sets';

import {
  DEPARTMENT_SUBJECT,
  DIRECTORY_PAGE,
  directory,
  ORGANIZATION_SETTINGS,
  OWN_DEPARTMENTS,
} from '../../server/resources.js';

export interface SeedDepartment {
  readonly id: string;
  readonly title: string;
  readonly parentId: string | null;
  readonly sortOrder: number;
}

/** Parents before children, so every parent exists when its child is written. */
export const SEED_DEPARTMENTS: readonly SeedDepartment[] = [
  { id: 'hq', title: 'Headquarters', parentId: null, sortOrder: 0 },
  { id: 'sales', title: 'Sales', parentId: 'hq', sortOrder: 0 },
  { id: 'support', title: 'Support', parentId: 'hq', sortOrder: 1 },
  { id: 'sales-east', title: 'East sales', parentId: 'sales', sortOrder: 0 },
];

/** Everyone in the organisation may open the directory and see the departments they belong to. */
export const staff: PermissionSet = definePermissionSet(
  'departments-example-staff',
)
  .title('Staff')
  .grant({
    resource: { type: 'page', id: DIRECTORY_PAGE },
    actions: [{ action: 'access' }],
  })
  .grant(
    directory.reference().grant({ view: { departments: OWN_DEPARTMENTS } }),
  )
  .build();

/** Assigned to Sales: its branch may open the organisation settings read-only, which Support may not. */
export const organizationViewer: PermissionSet = definePermissionSet(
  'departments-example-organization-viewer',
)
  .title('Organization viewer')
  .grant({
    resource: { type: 'settings', id: ORGANIZATION_SETTINGS },
    actions: [{ action: 'read' }],
  })
  .build();

/** Assigned to one user directly: the directory with every department, whatever the user belongs to. */
export const wholeDirectory: PermissionSet = definePermissionSet(
  'departments-example-whole-directory',
)
  .title('Whole directory')
  .grant({
    resource: { type: 'page', id: DIRECTORY_PAGE },
    actions: [{ action: 'access' }],
  })
  .grant(
    directory
      .reference()
      .grant({ view: { departments: recordAccess.allRecords.key } }),
  )
  .build();

export const SEED_PERMISSION_SETS: readonly PermissionSet[] = [
  staff,
  organizationViewer,
  wholeDirectory,
];

export interface SeedAssignment {
  readonly id: string;
  readonly permissionSetKey: string;
  readonly subjectType: string;
  readonly subjectId: string;
}

/** The staff set on the root department reaches everyone; the viewer set on Sales reaches Sales and East sales. */
export const DEPARTMENT_ASSIGNMENTS: readonly SeedAssignment[] = [
  {
    id: 'departments-example-staff-hq',
    permissionSetKey: staff.key,
    subjectType: DEPARTMENT_SUBJECT,
    subjectId: 'hq',
  },
  {
    id: 'departments-example-organization-viewer-sales',
    permissionSetKey: organizationViewer.key,
    subjectType: DEPARTMENT_SUBJECT,
    subjectId: 'sales',
  },
];

export interface DemoMembership {
  readonly departmentId: string;
  readonly primary: boolean;
}

export interface DemoAccount {
  readonly name: string;
  readonly email: string;
  readonly memberships: readonly DemoMembership[];
  /** Permission sets assigned to the user directly, besides what the departments pass down. */
  readonly permissionSets?: readonly string[];
}

/** Fictional accounts for practice; they share {@link DEMO_PASSWORD}. */
export const DEMO_ACCOUNTS: readonly DemoAccount[] = [
  {
    name: 'Dana Director',
    email: 'dana@departments.example',
    memberships: [{ departmentId: 'hq', primary: true }],
  },
  {
    name: 'Sam Seller',
    email: 'sam@departments.example',
    memberships: [{ departmentId: 'sales-east', primary: true }],
    permissionSets: [wholeDirectory.key],
  },
  {
    name: 'Sue Support',
    email: 'sue@departments.example',
    memberships: [{ departmentId: 'support', primary: true }],
  },
  {
    name: 'Li Liaison',
    email: 'li@departments.example',
    memberships: [
      { departmentId: 'sales', primary: true },
      { departmentId: 'support', primary: false },
    ],
  },
];

export const DEMO_PASSWORD = 'departments-demo';

import {
  definePermissionSet,
  type PermissionSet,
} from '@nocobase/authorization/permission-sets';

import {
  DEPARTMENT_SUBJECT,
  DIRECTORY_PAGE,
  directory,
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

export interface SeedAssignment {
  readonly id: string;
  readonly permissionSetKey: string;
  readonly subjectType: string;
  readonly subjectId: string;
}

/** The staff set is assigned to the root department; every department below it inherits it. */
export const STAFF_ASSIGNMENT: SeedAssignment = {
  id: 'departments-example-staff-hq',
  permissionSetKey: staff.key,
  subjectType: DEPARTMENT_SUBJECT,
  subjectId: 'hq',
};

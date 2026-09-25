import { defineDatabasePermission } from '@nocobase/app-plugin-authorization/server';
import {
  defineCompositeResource,
  type CompositeResourceBuilder,
  type DataScopeValue,
} from '@nocobase/authorization/core';

/** The inherited subject type; permission-set assignments and rules store it. */
export const DEPARTMENT_SUBJECT = 'org.department';
/** The settings item that gates the organisation settings pages and endpoints. */
export const ORGANIZATION_SETTINGS = 'organization';
/** The department directory page; its page grant opens the page only. */
export const DIRECTORY_PAGE = 'org.directory';
/** Record access selecting the departments the caller belongs to, ancestors included. */
export const OWN_DEPARTMENTS = 'org.ownDepartments';
export const DIRECTORY_RESOURCE = 'org.directory';

interface DepartmentRow {
  id: string;
  title: string;
  parentId: string | null;
  active: boolean;
}

const departmentData = defineDatabasePermission((permission) =>
  permission
    .collection<DepartmentRow>('departments')
    .title('Departments')
    .read(['id', 'title', 'parentId', 'active']),
);

/** The business operation the directory page calls: viewing departments, scoped by a data scope. */
// A type alias, not an interface, so it satisfies the builder's record constraint.
export type DirectoryActions = { view: { departments: DataScopeValue } };

export const directory: CompositeResourceBuilder<DirectoryActions> =
  defineCompositeResource(DIRECTORY_RESOURCE, (resource) =>
    resource
      .title('Department directory')
      .action('view', (action) =>
        action.title('View').grant('departments', departmentData),
      ),
  );

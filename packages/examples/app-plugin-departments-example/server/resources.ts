/** The package name, which is also this plugin's translation namespace. */
export const PACKAGE_NAME = '@nocobase/app-plugin-departments-example';
/** The inherited subject type; permission-set, sharing-rule and restriction-rule assignments store it. */
export const DEPARTMENT_SUBJECT = 'org.department';
/** The fixed subject meaning every user who heads an active department; its only id is `*`. */
export const DEPARTMENT_HEAD_SUBJECT = 'org.departmentHead';
/** Record access keys: the owner belongs to the viewer's departments, or to those and every one below them. */
export const SCOPE_MY_DEPARTMENTS = 'org.myDepartments';
export const SCOPE_MY_DEPARTMENTS_AND_BELOW = 'org.myDepartmentsAndBelow';
/** The settings item that gates the Departments settings page and its endpoints. */
export const DEPARTMENTS_SETTINGS = 'departments';
/** The authorization example's table its "own region" record access reads; the region sync writes it. */
export const SALES_MEMBERS = 'authorizationExampleSalesMembers';
/** The authorization example's business collections the department scopes apply to. */
export const PROJECTS = 'authorizationExampleProjects';
export const QUOTES = 'authorizationExampleQuotes';
export const ORDERS = 'authorizationExampleOrders';

/** A translation descriptor in this plugin's namespace. */
export function label(key: string): { key: string; ns: string } {
  return { key, ns: PACKAGE_NAME };
}

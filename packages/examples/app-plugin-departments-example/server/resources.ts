/** The package name, which is also this plugin's translation namespace. */
export const PACKAGE_NAME = '@nocobase/app-plugin-departments-example';
/** The inherited subject type; permission-set, sharing-rule and restriction-rule assignments store it. */
export const DEPARTMENT_SUBJECT = 'org.department';
/** The settings item that gates the Departments settings page and its endpoints. */
export const DEPARTMENTS_SETTINGS = 'departments';
/** The authorization example's table its "own region" record access reads; the region sync writes it. */
export const SALES_MEMBERS = 'authorizationExampleSalesMembers';

/** A translation descriptor in this plugin's namespace. */
export function label(key: string): { key: string; ns: string } {
  return { key, ns: PACKAGE_NAME };
}

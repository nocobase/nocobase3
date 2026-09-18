export const NS = '@nocobase/app-plugin-authorization-example';
export const MEMBERS = 'authorizationExampleSalesMembers';
export const PROJECTS = 'authorizationExampleProjects';
export const ORDERS = 'authorizationExampleOrders';
export const QUOTES = 'authorizationExampleQuotes';
export const label = (key: string): { key: string; ns: string } => ({
  key,
  ns: NS,
});

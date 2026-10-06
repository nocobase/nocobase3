/**
 * Where the server mounts the example's routes, relative to the API base.
 * The server's router and the client both read it, so the two cannot drift
 * apart.
 */
export const EXAMPLE_ROUTES: string = 'approval-example';

/** The library's standard record routes, beneath the example's. */
export const LIFECYCLE_ROUTES: string = `${EXAMPLE_ROUTES}/lifecycles`;

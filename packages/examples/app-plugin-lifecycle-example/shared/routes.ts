/**
 * Where the server mounts the library's record routes, relative to the API
 * base. The server's router and the client's hook both read it, so the two
 * cannot drift apart.
 */
export const LIFECYCLE_ROUTES: string = 'lifecycle-example/lifecycles';

const quarantinedConnections = new WeakSet<object>();

/** Adapter-private state, intentionally absent from package exports. */
export function quarantineKnexConnection(connection: object): void {
  quarantinedConnections.add(connection);
}

export function isQuarantinedKnexConnection(connection: object): boolean {
  return quarantinedConnections.has(connection);
}

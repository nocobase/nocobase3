import type { AuditResourceAdapter } from './authorization.js';
import type { AuditResourceAdapters } from './contracts.js';

/** Owned by one Audit composition; never shared across App containers. */
export class LocalAuditResourceAdapters implements AuditResourceAdapters {
  private readonly entries = new Map<string, AuditResourceAdapter>();
  private closed = false;

  register(adapter: AuditResourceAdapter): () => void {
    if (this.closed)
      throw new Error('Audit resource adapter registry is closed.');
    const { dataSource, resource } = adapter;
    if (
      typeof dataSource !== 'string' ||
      !dataSource ||
      typeof resource !== 'string' ||
      !resource ||
      typeof adapter.canRead !== 'function'
    )
      throw new Error('Invalid audit resource adapter.');
    const key = JSON.stringify([dataSource, resource]);
    if (this.entries.has(key))
      throw new Error('Audit resource adapter is already registered.');
    // Each registration has a fresh identity, even when an owner reuses its adapter.
    const canRead = adapter.canRead.bind(adapter);
    const entry: AuditResourceAdapter = Object.freeze({
      dataSource,
      resource,
      canRead,
    });
    this.entries.set(key, entry);
    return () => {
      if (this.entries.get(key) === entry) this.entries.delete(key);
    };
  }

  snapshot(): readonly AuditResourceAdapter[] {
    return Object.freeze([...this.entries.values()]);
  }

  dispose(): void {
    this.closed = true;
    this.entries.clear();
  }
}

import type { DatabaseConnection } from '@nocobase/db';
import type {
  AuditDeploymentRequirements,
  AuditSettings,
} from '../contracts.js';
import { AuditCaptureCatalog } from '../capture-catalog.js';
import { assertAuditSchema } from '../database/schema-check.js';
import { AuditError } from '../errors.js';
import { LocalAuditHealthService } from '../health-service.js';
import { assertAuditStoreConnection } from '../store-connection-check.js';
import type { PortableAuditStore } from '../store.js';

export interface AuditReadinessStore {
  readonly connection: DatabaseConnection;
  readonly store: PortableAuditStore;
}
export interface AuditReadinessOptions {
  readonly stores: readonly AuditReadinessStore[];
  readonly catalog: AuditCaptureCatalog;
  readonly health: LocalAuditHealthService;
  readonly requirements: AuditDeploymentRequirements;
}

/** Lifecycle resource for the eventual App provider; it does not install imaginary collectors. */
export class AuditReadiness {
  private readonly stores: ReadonlyMap<string, AuditReadinessStore>;
  private wasReady = false;
  private prepared = false;
  readonly requirements: AuditDeploymentRequirements;
  constructor(private readonly options: AuditReadinessOptions) {
    this.stores = new Map(
      options.stores.map((entry) => [entry.connection.name, entry]),
    );
    if (this.stores.size !== options.stores.length)
      throw new AuditError('AUDIT_TARGET_UNSUPPORTED');
    this.requirements = Object.freeze({
      ...options.requirements,
      requiredDataSources: Object.freeze([
        ...options.requirements.requiredDataSources,
      ]),
      mandatorySources: Object.freeze([
        ...options.requirements.mandatorySources,
      ]),
    });
  }

  async prepare(): Promise<void> {
    this.prepared = false;
    for (const { connection, store } of this.stores.values()) {
      await store.prepare();
      await assertAuditStoreConnection(connection, store);
    }
    this.prepared = true;
  }

  validate(settings: AuditSettings, previous?: AuditSettings): void {
    const required = this.requirements;
    if (
      (!settings.enabled &&
        (required.auditRequired ||
          required.mandatorySources.length > 0 ||
          required.requiredDataSources.length > 0)) ||
      (required.mandatorySources.includes('request') &&
        settings.sources.http === 'disabled') ||
      (required.mandatorySources.includes('business') &&
        settings.sources.runtime === 'disabled') ||
      (required.mandatorySources.includes('database') &&
        settings.sources.database.length === 0) ||
      required.requiredDataSources.some(
        (name) =>
          !settings.sources.database.some(
            (target) => target.dataSource === name,
          ),
      )
    )
      throw new AuditError('AUDIT_POLICY_CONFLICT');
    if (!this.stores.has(settings.observationStore))
      throw new AuditError('AUDIT_TARGET_UNSUPPORTED');
    for (const target of settings.sources.database) {
      if (!this.stores.has(target.dataSource))
        throw new AuditError('AUDIT_TARGET_UNSUPPORTED');
    }
    if (previous) {
      for (const target of previous.sources.database) {
        if (
          (required.requiredDataSources.includes(target.dataSource) ||
            required.mandatorySources.includes('database')) &&
          !settings.sources.database.some(
            (next) =>
              next.dataSource === target.dataSource &&
              next.table === target.table &&
              next.schema === target.schema,
          )
        )
          throw new AuditError('AUDIT_POLICY_CONFLICT');
      }
    }
  }

  async probe(settings: AuditSettings): Promise<void> {
    for (const name of new Set([
      settings.observationStore,
      ...settings.sources.database.map((target) => target.dataSource),
    ])) {
      const entry = this.stores.get(name);
      if (!entry) throw new AuditError('AUDIT_TARGET_UNSUPPORTED');
      try {
        await assertAuditSchema(entry.connection);
      } catch {
        this.options.health.failure('AUDIT_NOT_READY', 'audit.readiness', name);
        throw new AuditError('AUDIT_NOT_READY');
      }
    }
  }

  /** Synchronous capability check at execution; updates never detach callbacks. */
  effective(settings: AuditSettings, strict: boolean = false): boolean {
    this.validate(settings);
    const { catalog, health } = this.options;
    const observation = this.stores.get(settings.observationStore);
    if (!observation) throw new AuditError('AUDIT_TARGET_UNSUPPORTED');
    const missing =
      !this.prepared ||
      (settings.sources.http !== 'disabled' &&
        !catalog.covers('request', observation.connection)) ||
      (settings.sources.runtime !== 'disabled' &&
        !catalog.covers('business', observation.connection)) ||
      settings.sources.database.some((target) => {
        const entry = this.stores.get(target.dataSource);
        return !entry || !catalog.supports(target, entry.connection);
      });
    if (!strict)
      for (const previous of health.get().coverage) {
        if (
          !catalog
            .entries(settings)
            .some(
              (entry) =>
                entry.producer === previous.producer &&
                entry.dataSource === previous.store,
            )
        )
          health.report({ ...previous, registered: false });
      }
    if (!strict)
      for (const entry of catalog.entries(settings)) {
        const previous = health
          .get()
          .coverage.find(
            (item) =>
              item.producer === entry.producer &&
              item.store === entry.dataSource,
          );
        health.report({
          ...previous,
          producer: entry.producer,
          store: entry.dataSource,
          configured: entry.configured,
          registered: entry.live,
          observed: previous?.observed ?? false,
        });
      }
    if (!settings.enabled) {
      if (!strict) health.setState('disabled');
      return false;
    }
    if (missing) {
      if (!strict)
        health.setState(this.wasReady ? 'degraded' : 'partial-coverage');
      if (
        strict ||
        this.wasReady ||
        this.requirements.auditRequired ||
        this.requirements.mandatorySources.length > 0 ||
        this.requirements.requiredDataSources.length > 0
      )
        throw new AuditError('AUDIT_NOT_READY');
      return false;
    }
    if (!strict) {
      this.wasReady = true;
      health.setState('ready-no-events');
    }
    return true;
  }

  async start(settings: AuditSettings): Promise<boolean> {
    try {
      this.validate(settings);
      await this.prepare();
      await this.probe(settings);
      const effective = this.effective(settings);
      if (effective) {
        for (const previous of this.options.health.get().coverage) {
          if (previous.producer === 'audit.readiness')
            this.options.health.report({ ...previous, lastError: undefined });
        }
      }
      return effective;
    } catch (error) {
      this.options.health.failure(
        'AUDIT_NOT_READY',
        'audit.readiness',
        settings.observationStore,
      );
      if (
        this.requirements.auditRequired ||
        this.requirements.mandatorySources.length > 0 ||
        this.requirements.requiredDataSources.length > 0
      ) {
        throw error instanceof AuditError
          ? error
          : new AuditError('AUDIT_NOT_READY');
      }
      return false;
    }
  }
}

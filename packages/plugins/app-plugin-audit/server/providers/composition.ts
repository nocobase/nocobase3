import { queueManagerToken } from '@nocobase/app-server/queue';
import { AuditRetentionScheduler } from './retention-scheduler.js';
import { AuditRetentionService } from '../retention-service.js';
import {
  createAuditRetentionQueueResources,
  type AuditRetentionQueueResources,
} from '../queue/retention.js';
import { discoverAuditTableTargets } from './table-targets.js';
import { databaseManagerToken, transactionAuthority } from '@nocobase/db';
import { authenticationAuditToken } from '@nocobase/app-plugin-authentication/server/audit';
import { authorizationToken } from '@nocobase/app-plugin-authorization';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { databaseLifecycleObserverToken } from '@nocobase/app-server/database';
import {
  ServiceProvider,
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';
import { auditConfig, type AuditConfig } from '../config.js';
import { auditServiceToken, auditResourceAdaptersToken } from '../tokens.js';
import { LocalAuditResourceAdapters } from '../resource-adapters.js';
import { AuditError } from '../errors.js';
import { NodeAuditScopeCarrier } from '../scope.js';
import { TrustedAuditRuntime } from '../runtime.js';
import { PortableAuditStore } from '../store.js';
import { PersistentAuditSettingsService } from '../settings-service.js';
import { LocalAuditHealthService } from '../health-service.js';
import { AuditCaptureCatalog } from '../capture-catalog.js';
import { AuditReadiness } from './readiness.js';
import { bindAuditRecorder } from '../service.js';
import { createAuditHttpResources, type AuditHttpResources } from './http.js';
import { createAuditQueryResources } from './routes.js';
import { AuditDatabaseCollector } from '../database-collector.js';
import { registerAuditPermissions } from '../authorization.js';
import type {
  AuditRecorder,
  AuditService,
  TrustedAuditScope,
} from '../contracts.js';
import type { AuditApiRoutesOptions } from '../routes/index.js';
import { bindOfficialProducers } from './producers.js';

export const auditCompositionToken: ServiceToken<AuditComposition> =
  createServiceToken<AuditComposition>('@nocobase/audit/composition');

/** One owner per App; declaration imports never allocate live resources. */
export class AuditComposition {
  readonly resourceAdapters: LocalAuditResourceAdapters =
    new LocalAuditResourceAdapters();
  readonly health: LocalAuditHealthService = new LocalAuditHealthService(
    (diagnostic) => console.error('Audit diagnostic.', diagnostic),
  );
  readonly catalog: AuditCaptureCatalog = new AuditCaptureCatalog();
  readonly carrier: NodeAuditScopeCarrier;
  readonly runtime: TrustedAuditRuntime;
  readonly service: AuditService;
  readonly config: AuditConfig;
  private stores: PortableAuditStore[] = [];
  private settings?: PersistentAuditSettingsService;
  private readiness?: AuditReadiness;
  private http?: AuditHttpResources;
  private collectors: AuditDatabaseCollector[] = [];
  private retention: AuditRetentionQueueResources[] = [];
  private scheduler?: AuditRetentionScheduler;
  private prepared?: Promise<void>;
  private bootstrapping = true;
  private stopping = false;
  private disposed?: Promise<void>;

  constructor(readonly app: AppPluginApplication) {
    this.config = app.config.get(auditConfig);
    this.carrier = new NodeAuditScopeCarrier(app.appName);
    this.runtime = new TrustedAuditRuntime({
      appId: app.appName,
      carrier: this.carrier,
      bind: (scope) => this.bind(scope, 'audit.runtime'),
      diagnostic: (code) => console.error('Audit scope diagnostic.', { code }),
    });
    this.service = {
      bind: (scope, options) => this.bind(scope, options.producer),
      http: (declaration) => this.requireHttp().collector.http(declaration),
      markHttpResult: (context, result) =>
        this.requireHttp().collector.markHttpResult(context, result),
    };
  }
  get required(): boolean {
    return (
      this.config.auditRequired ||
      this.config.mandatorySources.length > 0 ||
      this.config.requiredDataSources.length > 0
    );
  }
  private requireHttp(): AuditHttpResources {
    if (!this.http) throw new AuditError('AUDIT_NOT_READY');
    return this.http;
  }
  private requireSettings(): PersistentAuditSettingsService {
    if (!this.settings) throw new AuditError('AUDIT_NOT_READY');
    return this.settings;
  }
  private bind(scope: TrustedAuditScope, producer: string): AuditRecorder {
    return {
      record: async (event, options = {}) => {
        if (this.stopping) throw new AuditError('AUDIT_NOT_READY');
        const settings = this.requireSettings();
        const transaction = options.transaction;
        const configStore = this.stores.find(
          (store) => store.binding.store === this.config.configurationStore,
        );
        if (!configStore) throw new AuditError('AUDIT_NOT_READY');
        let readOptions = {};
        if (transaction) {
          if (
            transactionAuthority.current(transaction.connection) !== transaction
          )
            throw new AuditError('AUDIT_TRANSACTION_MISMATCH');
          if (transaction.connection.name === this.config.configurationStore)
            readOptions = { transaction };
        }
        const policy = this.bootstrapping
          ? await settings.get(scope, readOptions)
          : await settings.snapshot(scope, readOptions);
        const store = this.stores.find(
          (candidate) =>
            candidate.binding.store ===
            (transaction?.connection.name ?? policy.observationStore),
        );
        if (!store) throw new AuditError('AUDIT_TRANSACTION_MISMATCH');
        try {
          const receipt = await bindAuditRecorder(scope, {
            store,
            producer,
            policy: async () => ({
              enabled: policy.enabled,
              excluded: policy.sources.runtime === 'disabled',
              revision: policy.revision,
              maxDetailsBytes: policy.maxDetailsBytes,
            }),
          }).record(event, options);
          if (receipt.state === 'committed')
            this.health.success(producer, store.binding.store);
          return receipt;
        } catch (error) {
          if (
            error instanceof AuditError &&
            error.code === 'AUDIT_WRITE_FAILED'
          )
            this.health.failure(error.code, producer, store.binding.store);
          throw error;
        }
      },
    };
  }
  async prepare(): Promise<void> {
    this.prepared ??= this.prepareStorage();
    try {
      await this.prepared;
    } catch (error) {
      this.prepared = undefined;
      throw error;
    }
  }
  private async prepareStorage(): Promise<void> {
    if (!this.app.container.has(databaseManagerToken))
      throw new AuditError('AUDIT_NOT_READY');
    const database = this.app.container.resolve(databaseManagerToken);
    const stores = this.config.stores.map((name) => ({
      connection: database.connection(name),
      store: new PortableAuditStore(database.connection(name), {
        appId: this.app.appName,
        store: name,
      }),
    }));
    const configuration = stores.find(
      (entry) => entry.connection.name === this.config.configurationStore,
    );
    if (!configuration) throw new AuditError('AUDIT_NOT_READY');
    const readiness = new AuditReadiness({
      stores,
      catalog: this.catalog,
      health: this.health,
      requirements: this.config,
    });
    await readiness.prepare();
    const settings = new PersistentAuditSettingsService({
      ...configuration,
      readiness,
      health: this.health,
      defaults: this.config.defaults,
    });
    await settings.initialize(this.runtime.current());
    this.stores = stores.map((entry) => entry.store);
    this.settings = settings;
    this.readiness = readiness;
    this.health.report({
      producer: 'audit.bootstrap',
      store: this.config.configurationStore,
      configured: true,
      registered: true,
      observed: false,
    });
  }
  async beforeDatabase(phase: 'migrations' | 'seeds'): Promise<void> {
    try {
      await this.prepare();
    } catch {
      this.health.failure(
        'AUDIT_NOT_READY',
        'audit.bootstrap',
        this.config.configurationStore,
      );
      if (this.required) throw new AuditError('AUDIT_NOT_READY');
      console.error(
        'Audit bootstrap is unobserved until storage migrations complete.',
        { code: 'AUDIT_NOT_READY', phase },
      );
      return;
    }
    // Deployment policy must admit automatic DDL before its attempted event.
    // Collector coverage is verified later, before ordinary traffic is admitted.
    this.readiness?.validate(
      await this.requireSettings().get(this.runtime.current()),
    );
    await this.runtime.recorder.record({
      action: 'database.' + phase + '.attempted',
      outcome: 'accepted',
    });
  }
  async afterDatabase(result: {
    phase: 'migrations' | 'seeds';
    outcome: 'success' | 'failed' | 'unknown';
    code: string;
  }): Promise<void> {
    // Missing storage at admission is an explicitly unobserved phase, not a retrospectively invented attempt.
    if (!this.settings) return;
    await this.runtime.recorder.record({
      action: 'database.' + result.phase + '.completed',
      outcome: result.outcome,
      details: { code: result.code },
    });
  }
  async boot(): Promise<void> {
    await this.prepare();
    const host = this.app.httpHost;
    if (!host) throw new AuditError('AUDIT_NOT_READY');
    const database = this.app.container.resolve(databaseManagerToken);
    this.http = createAuditHttpResources({
      application: {
        addHttpObserver: (observer) => host.addObserver(observer),
      },
      runtime: this.runtime,
      settings: this.requireSettings(),
      stores: this.stores,
      health: this.health,
      catalog: this.catalog,
      connections: this.stores.map((store) =>
        database.connection(store.binding.store),
      ),
    });
    this.app.container.instance(authenticationAuditToken, {
      runtime: this.runtime,
      collector: this.http.collector,
    });
    await bindOfficialProducers(
      this.app,
      this.runtime,
      this.service,
      this.http.collector,
      this.config.auditRequired,
    );
    registerAuditPermissions(this.app.container.resolve(authorizationToken));
    const settings = await this.requireSettings().get(this.runtime.current());
    for (const store of this.stores) {
      const connection = database.connection(store.binding.store);
      const collector = new AuditDatabaseCollector({
        connection,
        store,
        configurationStore: this.stores.find(
          (value) => value.binding.store === this.config.configurationStore,
        )!,
        settings: this.requireSettings(),
        scope: this.carrier,
        catalog: this.catalog,
        health: this.health,
        targets: await discoverAuditTableTargets(connection),
      });
      this.collectors.push(collector);
      await collector.start();
    }
    if (this.app.container.has(queueManagerToken)) {
      const queue = this.app.container.resolve(queueManagerToken);
      for (const store of this.stores) {
        const configurationStore = this.stores.find(
          (candidate) =>
            candidate.binding.store === this.config.configurationStore,
        );
        if (!configurationStore) throw new AuditError('AUDIT_NOT_READY');
        const service = new AuditRetentionService({
          connection: database.connection(store.binding.store),
          store,
          configurationStore,
          settings: this.requireSettings(),
          health: this.health,
        });
        this.retention.push(
          createAuditRetentionQueueResources({
            database,
            queue,
            binding: store.binding,
            service,
          }),
        );
      }
    }
    for (const store of this.stores) {
      const connection = database.connection(store.binding.store);
      const handle = this.catalog.register({
        producer: 'audit.runtime',
        kind: 'business',
        connection,
        targets: [],
        dispose: () => undefined,
      });
      await handle.verify(async () => {
        const receipt = await connection.transaction(async (current) => {
          const transaction = transactionAuthority.current(current);
          if (!transaction) throw new AuditError('AUDIT_NOT_READY');
          return this.runtime.recorder.record(
            {
              action: 'audit.runtime.ready',
              outcome: 'success',
            },
            { transaction },
          );
        });
        if (settings.enabled && settings.sources.runtime !== 'disabled') {
          if (receipt.state !== 'pending-commit')
            throw new AuditError('AUDIT_NOT_READY');
          const persisted = await store.queryEvent(this.runtime.current(), {
            store: store.binding.store,
            id: receipt.eventId,
          });
          if (!persisted || persisted.action !== 'audit.runtime.ready')
            throw new AuditError('AUDIT_NOT_READY');
          this.health.success('audit.runtime', store.binding.store);
        }
      });
    }
  }

  async start(): Promise<void> {
    this.requireHttp().collector.validateRoutes(this.app.router.routes);
    const host = this.app.httpHost;
    if (!host || !this.readiness) throw new AuditError('AUDIT_NOT_READY');
    await this.requireHttp().verify(async () => {
      await host.probe();
    });
    this.bootstrapping = false;
    const settings = await this.requireSettings().get(this.runtime.current());
    const ready = await this.readiness.start(settings);
    if (settings.enabled && !ready) throw new AuditError('AUDIT_NOT_READY');
  }
  async ready(): Promise<void> {
    for (const retention of this.retention) await retention.dispatch();
    this.scheduler ??= new AuditRetentionScheduler(
      this.retention.map((resource, index) => ({
        resource,
        store: this.stores[index].binding.store,
      })),
      this.health,
    );
    this.scheduler.start();
  }
  routes(): AuditApiRoutesOptions {
    const configurationStore = this.stores.find(
      (store) => store.binding.store === this.config.configurationStore,
    );
    if (!configurationStore) throw new AuditError('AUDIT_NOT_READY');
    const query = createAuditQueryResources({
      appAuthorization: this.app.container.resolve(authorizationToken),
      boundary: { appId: this.app.appName },
      stores: this.config.stores,
      adapters: () => this.resourceAdapters.snapshot(),
      eventStores: this.stores,
      configurationStore,
      settings: this.requireSettings(),
    });
    return {
      ...query,
      settings: this.requireSettings(),
      health: this.health,
      http: this.requireHttp().collector,
      runtime: this.runtime,
      configurationStore: this.config.configurationStore,
      catalog: this.catalog,
      stores: this.config.stores,
      declaredRoutes: () =>
        this.requireHttp().collector.describeRoutes(this.app.router.routes),
    };
  }
  dispose(): Promise<void> {
    // Application drains admitted HTTP requests before provider shutdown.
    this.resourceAdapters.dispose();
    this.disposed ??= (async () => {
      await this.scheduler?.dispose();
      this.stopping = true;
      for (const retention of this.retention) retention.stopAccepting();
      const errors: unknown[] = [];
      for (const dispose of [
        () => this.http?.dispose(),
        ...this.retention.map((retention) => () => retention.dispose()),
        ...[...this.collectors]
          .reverse()
          .map((collector) => () => collector.dispose()),
        () => this.catalog.dispose(),
        () => this.runtime.dispose(),
      ]) {
        try {
          await Promise.resolve(dispose());
        } catch (error) {
          errors.push(error);
        }
      }
      if (errors.length)
        throw new AggregateError(errors, 'Audit shutdown failed.');
    })();
    return this.disposed;
  }
}

export class AuditProvider extends ServiceProvider<AppPluginApplication> {
  readonly name: string = '@nocobase/app-plugin-audit';
  override register(): void {
    this.app.container.singleton(
      auditCompositionToken,
      () => new AuditComposition(this.app),
    );
    this.app.container.singleton(
      auditServiceToken,
      () => this.app.container.resolve(auditCompositionToken).service,
    );
    this.app.container.singleton(
      auditResourceAdaptersToken,
      () => this.app.container.resolve(auditCompositionToken).resourceAdapters,
    );
    this.app.container.instance(databaseLifecycleObserverToken, {
      before: (phase) =>
        this.app.container.resolve(auditCompositionToken).beforeDatabase(phase),
      after: (result) =>
        this.app.container.resolve(auditCompositionToken).afterDatabase(result),
    });
  }
  override async boot(): Promise<void> {
    await this.app.container.resolve(auditCompositionToken).boot();
  }
  override async start(): Promise<void> {
    await this.app.container.resolve(auditCompositionToken).start();
  }
  override async ready(): Promise<void> {
    await this.app.container.resolve(auditCompositionToken).ready();
  }
  override async shutdown(): Promise<void> {
    await this.app.container.resolveIfCreated(auditCompositionToken)?.dispose();
  }
}

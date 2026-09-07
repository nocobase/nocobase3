import { randomUUID } from 'node:crypto';
import type {
  AuditCoverage,
  AuditErrorCode,
  AuditHealthDto,
  AuditHealthQuery,
  AuditHealthState,
} from './contracts.js';
import type { AuditHealthService } from './internal-contracts.js';

export interface AuditInstanceObservation extends AuditHealthDto {
  readonly observedAt: string;
  readonly dataSources: readonly string[];
  readonly scope:
    'current-instance-only' | 'unobserved-instance' | 'unobserved-data-source';
}
export interface AuditHealthDiagnostic {
  readonly code: AuditErrorCode;
  readonly producer: string;
  readonly dataSource: string;
  readonly instanceId: string;
  readonly observedAt: string;
}

/** Fault visibility survives loss of the audit database. */
export class LocalAuditHealthService implements AuditHealthService {
  readonly instanceId: string;
  private state: AuditHealthState = 'disabled';
  private readonly coverage: Map<string, AuditCoverage> = new Map();
  private observedAt: string = new Date().toISOString();

  constructor(
    private readonly diagnostic: (event: AuditHealthDiagnostic) => void,
    instanceId: string = randomUUID(),
  ) {
    this.instanceId = instanceId;
  }

  setState(state: AuditHealthState): void {
    this.state = state;
    this.observedAt = new Date().toISOString();
  }

  report(coverage: AuditCoverage): void {
    this.coverage.set(JSON.stringify([coverage.producer, coverage.store]), {
      producer: coverage.producer,
      store: coverage.store,
      configured: coverage.configured,
      registered: coverage.registered,
      observed: coverage.observed,
      ...(coverage.lastSuccessAt
        ? { lastSuccessAt: coverage.lastSuccessAt }
        : {}),
      ...(coverage.lastError
        ? {
            lastError: {
              code: coverage.lastError.code,
              occurredAt: coverage.lastError.occurredAt,
            },
          }
        : {}),
    });
    this.observedAt = new Date().toISOString();
  }

  success(producer: string, store: string): void {
    const previous = this.coverage.get(JSON.stringify([producer, store]));
    this.report({
      producer,
      store,
      configured: previous?.configured ?? false,
      registered: previous?.registered ?? false,
      observed: true,
      lastSuccessAt: new Date().toISOString(),
    });
  }

  failure(code: AuditErrorCode, producer: string, store: string): void {
    const previous = this.coverage.get(JSON.stringify([producer, store]));
    const observedAt = new Date().toISOString();
    this.report({
      producer,
      store,
      configured: previous?.configured ?? false,
      registered: previous?.registered ?? false,
      observed: previous?.observed ?? false,
      lastSuccessAt: previous?.lastSuccessAt,
      lastError: { code, occurredAt: observedAt },
    });
    try {
      this.diagnostic(
        Object.freeze({
          code,
          producer,
          dataSource: store,
          instanceId: this.instanceId,
          observedAt,
        }),
      );
    } catch {
      // Local state remains available when the existing diagnostic sink also fails.
      this.observedAt = observedAt;
    }
  }

  get(query: AuditHealthQuery = {}): AuditHealthDto {
    return this.observe(query);
  }

  observe(query: AuditHealthQuery = {}): AuditInstanceObservation {
    if (query.instanceId && query.instanceId !== this.instanceId)
      return {
        instanceId: query.instanceId,
        observation: 'unknown',
        state: 'partial-coverage',
        coverage: [],
        observedAt: new Date().toISOString(),
        dataSources: [],
        scope: 'unobserved-instance',
      };
    const coverage = [...this.coverage.values()].filter(
      (entry) => !query.store || entry.store === query.store,
    );
    if (query.store && coverage.length === 0)
      return {
        instanceId: this.instanceId,
        observation: 'unknown',
        state: 'partial-coverage',
        coverage: [],
        observedAt: new Date().toISOString(),
        dataSources: [],
        scope: 'unobserved-data-source',
      };
    const state = coverage.some((entry) => entry.lastError)
      ? 'degraded'
      : this.state === 'ready-no-events' &&
          coverage.some((entry) => entry.observed)
        ? 'healthy'
        : this.state;
    return structuredClone({
      instanceId: this.instanceId,
      observation: 'local',
      state,
      coverage,
      observedAt: this.observedAt,
      dataSources: [...new Set(coverage.map((entry) => entry.store))],
      scope: 'current-instance-only',
    });
  }
}

import type { DatabaseConnection } from '@nocobase/db';
import type {
  AuditKind,
  AuditSettings,
  AuditTablePolicy,
} from './contracts.js';
import { AuditError } from './errors.js';

export interface AuditCaptureRegistration {
  readonly producer: string;
  readonly kind: AuditKind;
  readonly connection: DatabaseConnection;
  /** Canonical physical targets resolved by the collector, never logical aliases. */
  readonly targets: readonly AuditTablePolicy[];
  readonly dispose: () => void | Promise<void>;
}
export interface AuditCaptureEntry {
  readonly producer: string;
  readonly kind: AuditKind;
  readonly dataSource: string;
  readonly generation: number;
  readonly configured: boolean;
  readonly live: boolean;
  readonly verified: boolean;
  readonly targets: readonly AuditTablePolicy[];
}
export interface AuditCaptureHandle {
  readonly generation: number;
  verify(probe: () => Promise<void>): Promise<void>;
  dispose(): Promise<void>;
}
interface Registration {
  readonly input: AuditCaptureRegistration;
  readonly generation: number;
  verified: boolean;
  dispose(): Promise<void>;
}
export function sameAuditTarget(
  a: AuditTablePolicy,
  b: AuditTablePolicy,
): boolean {
  return (
    a.dataSource === b.dataSource &&
    a.schema === b.schema &&
    a.table === b.table
  );
}

/** App-local capability registry. Registration alone never asserts end-to-end coverage. */
export class AuditCaptureCatalog {
  private generation = 0;
  private readonly registrations: Map<number, Registration> = new Map();

  register(input: AuditCaptureRegistration): AuditCaptureHandle {
    if (
      !input.producer ||
      input.targets.some(
        (target) => target.dataSource !== input.connection.name,
      )
    )
      throw new AuditError('AUDIT_TARGET_UNSUPPORTED');
    let disposal: Promise<void> | undefined;
    let verification = 0;
    const entry: Registration = {
      input: {
        ...input,
        targets: Object.freeze(
          input.targets.map((target) => Object.freeze({ ...target })),
        ),
      },
      generation: ++this.generation,
      verified: false,
      dispose: (): Promise<void> => {
        this.registrations.delete(entry.generation);
        disposal ??= Promise.resolve().then(() => input.dispose());
        return disposal;
      },
    };
    this.registrations.set(entry.generation, entry);
    return Object.freeze({
      generation: entry.generation,
      verify: async (probe: () => Promise<void>): Promise<void> => {
        const attempt = ++verification;
        entry.verified = false;
        try {
          await probe();
        } catch {
          throw new AuditError('AUDIT_NOT_READY');
        }
        if (
          attempt !== verification ||
          !this.registrations.has(entry.generation)
        )
          throw new AuditError('AUDIT_NOT_READY');
        entry.verified = true;
      },
      dispose: (): Promise<void> => entry.dispose(),
    });
  }

  entries(settings: AuditSettings): readonly AuditCaptureEntry[] {
    const entries: AuditCaptureEntry[] = [...this.registrations.values()].map(
      ({ input, generation, verified }) => ({
        producer: input.producer,
        kind: input.kind,
        dataSource: input.connection.name,
        generation,
        live: true,
        verified,
        configured:
          settings.enabled &&
          (input.kind === 'request'
            ? settings.sources.http !== 'disabled'
            : input.kind === 'business'
              ? settings.sources.runtime !== 'disabled'
              : input.targets.some((target) =>
                  settings.sources.database.some((selected) =>
                    sameAuditTarget(target, selected),
                  ),
                )),
        targets: input.targets,
      }),
    );
    const missing = (
      kind: AuditKind,
      dataSource: string,
      targets: readonly AuditTablePolicy[],
    ): void => {
      entries.push({
        producer: 'unregistered:' + kind,
        kind,
        dataSource,
        generation: 0,
        configured: settings.enabled,
        live: false,
        verified: false,
        targets,
      });
    };
    if (
      settings.sources.http !== 'disabled' &&
      !entries.some(
        (entry) =>
          entry.kind === 'request' &&
          entry.dataSource === settings.observationStore,
      )
    )
      missing('request', settings.observationStore, []);
    if (
      settings.sources.runtime !== 'disabled' &&
      !entries.some(
        (entry) =>
          entry.kind === 'business' &&
          entry.dataSource === settings.observationStore,
      )
    )
      missing('business', settings.observationStore, []);
    for (const target of settings.sources.database) {
      if (
        !entries.some(
          (entry) =>
            entry.kind === 'database' &&
            entry.targets.some((candidate) =>
              sameAuditTarget(candidate, target),
            ),
        )
      )
        missing('database', target.dataSource, [target]);
    }
    return entries;
  }

  supports(target: AuditTablePolicy, connection: DatabaseConnection): boolean {
    return [...this.registrations.values()].some(
      ({ input, verified }) =>
        verified &&
        input.kind === 'database' &&
        input.connection === connection &&
        input.targets.some((candidate) => sameAuditTarget(candidate, target)),
    );
  }

  covers(kind: AuditKind, connection: DatabaseConnection): boolean {
    return [...this.registrations.values()].some(
      ({ input, verified }) =>
        verified && input.kind === kind && input.connection === connection,
    );
  }

  async dispose(): Promise<void> {
    const entries = [...this.registrations.values()].reverse();
    const results = await Promise.allSettled(
      entries.map((entry) => entry.dispose()),
    );
    if (results.some((result) => result.status === 'rejected'))
      throw new AuditError('AUDIT_NOT_READY');
  }
}

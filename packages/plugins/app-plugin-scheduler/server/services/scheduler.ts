import type { SchedulerService } from '../tokens.js';
import type { ScheduleManifestEntry, ScheduleStore } from '../store.js';
import type { ScheduleTargetRegistry } from '../schedules/registry.js';
import type { ScheduleListItem } from '../tokens.js';

export class DefaultSchedulerService implements SchedulerService {
  public constructor(
    private readonly store: ScheduleStore,
    private readonly targets: ScheduleTargetRegistry,
    private readonly loadManifest: () => Promise<
      readonly ScheduleManifestEntry[]
    >,
  ) {}

  public async list(): Promise<readonly ScheduleListItem[]> {
    const [records, targets] = await Promise.all([
      this.store.list(),
      this.store.listTargets(),
    ]);
    const byId = new Map(targets.map((target) => [target.id, target]));
    return Promise.all(
      records.map(async (record): Promise<ScheduleListItem> => {
        const target = byId.get(record.id);
        return {
          ...record,
          targetSummary: target
            ? await this.targets.describe(target.type, target.config)
            : { targetLabel: record.targetType, state: 'missing' },
        };
      }),
    );
  }

  public listOccurrences(
    scheduleId: string,
  ): ReturnType<ScheduleStore['listOccurrences']> {
    return this.store.listOccurrences(scheduleId);
  }

  public async sync(finalize: boolean = false): Promise<void> {
    const manifest = await this.loadManifest();
    const identities = new Set<string>();
    for (const entry of manifest) {
      const identity = `${entry.owner}\0${entry.definition.key}`;
      if (identities.has(identity)) {
        throw new Error(
          `Duplicate Schedule definition: ${entry.owner}/${entry.definition.key}`,
        );
      }
      identities.add(identity);
      const validation = this.targets.validate(entry.definition);
      if (!validation.valid) {
        throw new Error(
          `Invalid Schedule target for ${entry.owner}/${entry.definition.key}: ${validation.reason ?? 'invalid-config'}`,
        );
      }
    }
    await this.store.reconcile(manifest, finalize);
  }
}

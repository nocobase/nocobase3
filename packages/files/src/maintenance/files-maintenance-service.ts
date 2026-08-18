import type { FilesStore } from "../persistence/files-store.ts";
import type { StorageDriverRegistry } from "../storage/driver-registry.ts";

export interface MaintenanceResult {
  scanned: number;
  succeeded: number;
  retried: number;
  failed: number;
  skipped: number;
}

export interface FilesMaintenanceRunOptions {
  now?: Date;
  expireLimit?: number;
  deleteLimit?: number;
}

export interface FilesMaintenanceRunResult {
  expiredUploads: MaintenanceResult;
  deletedObjects: MaintenanceResult;
}

export interface FilesMaintenanceService {
  expireUploads(options?: { now?: Date; limit?: number }): Promise<MaintenanceResult>;
  deletePendingObjects(options?: { limit?: number }): Promise<MaintenanceResult>;
  runOnce(options?: FilesMaintenanceRunOptions): Promise<FilesMaintenanceRunResult>;
}

const limit = (value = 100) => {
  if (!Number.isSafeInteger(value) || value < 1 || value > 1000) throw new RangeError("Maintenance limit must be between 1 and 1000");
  return value;
};
const result = (): MaintenanceResult => ({ scanned: 0, succeeded: 0, retried: 0, failed: 0, skipped: 0 });

export class DefaultFilesMaintenanceService implements FilesMaintenanceService {
  constructor(private readonly store: FilesStore, private readonly registry: StorageDriverRegistry, private readonly now = () => new Date(), private readonly logger?: { error(error: unknown): void }) {}

  async expireUploads(options: { now?: Date; limit?: number } = {}): Promise<MaintenanceResult> {
    const current = options.now ?? this.now();
    if (Number.isNaN(current.getTime())) throw new RangeError("Invalid maintenance time");
    const output = result();
    for (const candidate of await this.store.listExpiredPendingUploads(current, limit(options.limit))) {
      output.scanned++;
      const claimed = await this.store.claimExpiredUpload(candidate.workspaceId, candidate.id, current);
      if (!claimed) { output.skipped++; continue; }
      try {
        await this.registry.get(claimed.file.backendKey).deleteObject({ key: claimed.file.storageKey });
        await this.store.completeExpiredUploadCleanup(candidate.workspaceId, candidate.id, current);
        output.succeeded++;
      } catch {
        try { await this.store.releaseExpiredUploadClaim(candidate.workspaceId, candidate.id); output.retried++; }
        catch { output.failed++; }
        this.logger?.error(new Error("Files maintenance upload cleanup failed"));
      }
    }
    return output;
  }

  async deletePendingObjects(options: { limit?: number } = {}): Promise<MaintenanceResult> {
    const output = result();
    for (const candidate of await this.store.listFilesPendingPhysicalDelete(limit(options.limit))) {
      output.scanned++;
      const claimed = await this.store.claimFilePendingPhysicalDelete(candidate.workspaceId, candidate.id);
      if (!claimed) { output.skipped++; continue; }
      try {
        await this.registry.get(claimed.backendKey).deleteObject({ key: claimed.storageKey });
        await this.store.markPhysicalDeleteCompleted(claimed.workspaceId, claimed.id, this.now());
        output.succeeded++;
      } catch {
        try { await this.store.releaseFilePhysicalDeleteClaim(claimed.workspaceId, claimed.id); output.retried++; }
        catch { output.failed++; }
        this.logger?.error(new Error("Files maintenance object cleanup failed"));
      }
    }
    return output;
  }

  async runOnce(options: FilesMaintenanceRunOptions = {}): Promise<FilesMaintenanceRunResult> {
    return {
      expiredUploads: await this.expireUploads({ now: options.now, limit: options.expireLimit }),
      deletedObjects: await this.deletePendingObjects({ limit: options.deleteLimit }),
    };
  }
}

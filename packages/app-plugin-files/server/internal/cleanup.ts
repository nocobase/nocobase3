import type { DatabaseConnection } from '@nocobase/app-database';

import type { FileKernel } from './kernel.js';
import type {
  ExpiredRelationReservation,
  RelationBindingRepository,
} from './relation-repository.js';
import type {
  FilesRepository,
  TemporaryCleanupCandidate,
} from './repository.js';

export const DEFAULT_FILES_CLEANUP_BATCH_SIZE = 100;
export const DEFAULT_FILES_CLEANUP_TIME_BUDGET_MS = 5_000;

export interface FilesCleanupOptions {
  batchSize?: number;
  timeBudgetMs?: number;
}

export interface FilesCleanupResult {
  selected: number;
  attempted: number;
  cleaned: number;
  releasedReservations: number;
  skipped: number;
  deleteFailures: number;
  timedOut: boolean;
}

export interface RelationCleanupTarget {
  repository: RelationBindingRepository;
}

export interface CreateFilesCleanupOptions {
  repository: FilesRepository;
  kernel: FileKernel;
  relationTargets: ReadonlySet<RelationCleanupTarget>;
  clock: () => Date;
  elapsed?: () => number;
}

type CleanupCandidate =
  | {
      type: 'reservation';
      target: RelationCleanupTarget;
      reservation: ExpiredRelationReservation;
    }
  | { type: 'file'; file: TemporaryCleanupCandidate };

class ReservationChangedError extends Error {}

export class FilesCleanup {
  readonly #repository: FilesRepository;
  readonly #kernel: FileKernel;
  readonly #relationTargets: ReadonlySet<RelationCleanupTarget>;
  readonly #clock: () => Date;
  readonly #elapsed: () => number;

  constructor(options: CreateFilesCleanupOptions) {
    this.#repository = options.repository;
    this.#kernel = options.kernel;
    this.#relationTargets = options.relationTargets;
    this.#clock = options.clock;
    this.#elapsed = options.elapsed ?? (() => performance.now());
  }

  async run(options: FilesCleanupOptions = {}): Promise<FilesCleanupResult> {
    const batchSize = readPositiveInteger(
      options.batchSize,
      DEFAULT_FILES_CLEANUP_BATCH_SIZE,
      'batchSize',
    );
    const timeBudgetMs = readPositiveInteger(
      options.timeBudgetMs,
      DEFAULT_FILES_CLEANUP_TIME_BUDGET_MS,
      'timeBudgetMs',
    );
    const cutoff = readClock(this.#clock);
    const deadline = this.#elapsed() + timeBudgetMs;
    const candidates = await this.#selectCandidates(cutoff, batchSize);
    const result: FilesCleanupResult = {
      selected: candidates.length,
      attempted: 0,
      cleaned: 0,
      releasedReservations: 0,
      skipped: 0,
      deleteFailures: 0,
      timedOut: false,
    };
    const processedFileIds = new Set<string>();

    for (const candidate of candidates) {
      if (this.#elapsed() >= deadline) {
        result.timedOut = true;
        break;
      }
      result.attempted += 1;
      if (candidate.type === 'reservation') {
        const outcome = await this.#cleanupReservation(candidate, cutoff);
        if (outcome.fileProcessed) {
          processedFileIds.add(candidate.reservation.fileId);
        }
        result.cleaned += outcome.cleaned ? 1 : 0;
        result.releasedReservations += outcome.released ? 1 : 0;
        result.deleteFailures += outcome.deleteFailed ? 1 : 0;
        result.skipped += outcome.skipped ? 1 : 0;
        continue;
      }
      if (processedFileIds.has(candidate.file.id)) {
        result.skipped += 1;
        continue;
      }
      if (await this.#hasRelationBinding(candidate.file.id)) {
        result.skipped += 1;
        continue;
      }
      const outcome = await this.#cleanupFile(candidate.file, cutoff);
      result.cleaned += outcome.cleaned ? 1 : 0;
      result.deleteFailures += outcome.deleteFailed ? 1 : 0;
      result.skipped += outcome.skipped ? 1 : 0;
    }

    return result;
  }

  async #hasRelationBinding(fileId: string): Promise<boolean> {
    for (const target of this.#relationTargets) {
      if (await target.repository.hasFile(fileId)) {
        return true;
      }
    }
    return false;
  }

  async #selectCandidates(
    cutoff: Date,
    batchSize: number,
  ): Promise<CleanupCandidate[]> {
    const candidates: CleanupCandidate[] = [];
    for (const target of this.#relationTargets) {
      const reservations = await target.repository.listExpiredReservations(
        cutoff,
        batchSize,
      );
      candidates.push(
        ...reservations.map((reservation): CleanupCandidate => ({
          type: 'reservation',
          target,
          reservation,
        })),
      );
    }
    const files = await this.#repository.listTemporaryCleanupCandidates(
      cutoff,
      batchSize,
    );
    candidates.push(
      ...files.map((file): CleanupCandidate => ({ type: 'file', file })),
    );
    const selected: CleanupCandidate[] = [];
    const selectedFileIds = new Set<string>();
    for (const candidate of candidates.sort((left, right) => {
      const leftExpiry = candidateExpiry(left).getTime();
      const rightExpiry = candidateExpiry(right).getTime();
      if (leftExpiry !== rightExpiry) {
        return leftExpiry - rightExpiry;
      }
      if (left.type !== right.type) {
        return left.type === 'reservation' ? -1 : 1;
      }
      return candidateId(left).localeCompare(candidateId(right));
    })) {
      const fileId = candidateFileId(candidate);
      if (selectedFileIds.has(fileId)) {
        continue;
      }
      selected.push(candidate);
      selectedFileIds.add(fileId);
      if (selected.length === batchSize) {
        break;
      }
    }
    return selected;
  }

  async #cleanupReservation(
    candidate: Extract<CleanupCandidate, { type: 'reservation' }>,
    cutoff: Date,
  ): Promise<CleanupItemResult> {
    const { reservation, target } = candidate;
    const record = await this.#kernel.getRecord(reservation.fileId);
    if (record?.status === 'ready') {
      return skippedResult();
    }
    if (
      record?.status === 'pending' &&
      record.uploadExpiresAt.getTime() > cutoff.getTime()
    ) {
      return skippedResult();
    }
    try {
      const result = await this.#kernel.cancelUpload(
        reservation.fileId,
        async ({ connection }) => {
          await requireReservationRelease(
            target.repository,
            reservation,
            cutoff,
            connection,
          );
        },
        record === undefined
          ? { cutoff }
          : {
              cutoff,
              expectedUploadExpiresAt: record.uploadExpiresAt,
            },
      );
      if (result.outcome === 'ready') {
        return skippedResult();
      }
      if (result.outcome === 'missing') {
        return {
          cleaned: false,
          released: true,
          deleteFailed: false,
          skipped: false,
          fileProcessed: false,
        };
      }
      return {
        cleaned: result.cleanupCompleted,
        released: true,
        deleteFailed: !result.cleanupCompleted,
        skipped: false,
        fileProcessed: true,
      };
    } catch (error) {
      if (error instanceof ReservationChangedError) {
        return skippedResult();
      }
      throw error;
    }
  }

  async #cleanupFile(
    candidate: TemporaryCleanupCandidate,
    cutoff: Date,
  ): Promise<CleanupItemResult> {
    const result = await this.#kernel.cancelUpload(candidate.id, undefined, {
      cutoff,
      expectedUploadExpiresAt: candidate.uploadExpiresAt,
    });
    if (result.outcome !== 'failed') {
      return skippedResult();
    }
    return {
      cleaned: result.cleanupCompleted,
      released: false,
      deleteFailed: !result.cleanupCompleted,
      skipped: false,
      fileProcessed: true,
    };
  }
}

interface CleanupItemResult {
  cleaned: boolean;
  released: boolean;
  deleteFailed: boolean;
  skipped: boolean;
  fileProcessed: boolean;
}

function skippedResult(): CleanupItemResult {
  return {
    cleaned: false,
    released: false,
    deleteFailed: false,
    skipped: true,
    fileProcessed: false,
  };
}

async function requireReservationRelease(
  repository: RelationBindingRepository,
  reservation: ExpiredRelationReservation,
  cutoff: Date,
  connection: DatabaseConnection,
): Promise<void> {
  const released = await repository.releaseExpiredReservation(
    {
      id: reservation.id,
      recordId: reservation.recordId,
      fileId: reservation.fileId,
      cutoff,
    },
    connection,
  );
  if (!released) {
    throw new ReservationChangedError();
  }
}

function candidateExpiry(candidate: CleanupCandidate): Date {
  return candidate.type === 'reservation'
    ? requireReservationExpiry(candidate.reservation)
    : candidate.file.uploadExpiresAt;
}

function candidateId(candidate: CleanupCandidate): string {
  return candidate.type === 'reservation'
    ? candidate.reservation.id
    : candidate.file.id;
}

function candidateFileId(candidate: CleanupCandidate): string {
  return candidate.type === 'reservation'
    ? candidate.reservation.fileId
    : candidate.file.id;
}

function requireReservationExpiry(
  reservation: ExpiredRelationReservation,
): Date {
  if (reservation.reservationExpiresAt === null) {
    throw new Error('An expired relation reservation requires an expiry.');
  }
  return reservation.reservationExpiresAt;
}

function readClock(clock: () => Date): Date {
  const value = clock();
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new Error('Files cleanup clock returned an invalid date.');
  }
  return new Date(value.getTime());
}

function readPositiveInteger(
  value: number | undefined,
  defaultValue: number,
  field: string,
): number {
  const resolved = value ?? defaultValue;
  if (!Number.isSafeInteger(resolved) || resolved <= 0) {
    throw new Error(`Files cleanup ${field} must be a positive safe integer.`);
  }
  return resolved;
}

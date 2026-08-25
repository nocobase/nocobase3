import { lstat, readdir } from 'node:fs/promises';
import path from 'node:path';

export interface HubStorageCategory {
  key: string;
  labelKey: string;
  descriptionKey: string;
  bytes: number;
  reclaimableBytes: number | null;
  scope: string;
  accuracy: 'exact' | 'derived';
}

export interface HubStorageMeasurement {
  filesystem: {
    capacityBytes: number;
    usedBytes: number;
    availableBytes: number;
    usedPercent: number;
  };
  knownUsageBytes: number;
  categories: HubStorageCategory[];
  measuredAt: string;
}

export interface HubStorageServiceOptions {
  sourceRoot?: string;
  releaseRoot?: string;
  logsRoot?: string;
}

const CATEGORY_META: Readonly<
  Record<string, { labelKey: string; descriptionKey: string }>
> = {
  sourceRepositories: {
    labelKey: 'storage.sourceRepositories',
    descriptionKey: 'storage.sourceRepositories.description',
  },
  releaseArtifacts: {
    labelKey: 'storage.releaseArtifacts',
    descriptionKey: 'storage.releaseArtifacts.description',
  },
  temporaryUploads: {
    labelKey: 'storage.temporaryUploads',
    descriptionKey: 'storage.temporaryUploads.description',
  },
  runtimeData: {
    labelKey: 'storage.runtimeData',
    descriptionKey: 'storage.runtimeData.description',
  },
  logs: {
    labelKey: 'storage.logs',
    descriptionKey: 'storage.logs.description',
  },
  otherFilesystemUsage: {
    labelKey: 'storage.otherFilesystemUsage',
    descriptionKey: 'storage.otherFilesystemUsage.description',
  },
};

export class HubStorageService {
  private readonly sourceRoot?: string;
  private readonly releaseRoot?: string;
  private readonly logsRoot?: string;

  constructor(options: HubStorageServiceOptions = {}) {
    this.sourceRoot = resolveOptionalRoot(options.sourceRoot);
    this.releaseRoot = resolveOptionalRoot(options.releaseRoot);
    this.logsRoot = resolveOptionalRoot(options.logsRoot);
  }

  async measure(): Promise<HubStorageMeasurement> {
    const [
      sourceRepositories,
      releaseArtifacts,
      temporaryUploads,
      runtimeData,
      logs,
    ] = await Promise.all([
      measureDirectory(this.sourceRoot),
      measureDirectory(this.releaseRoot, {
        exclude: new Set(['.uploads', '.runtime', '.catalog']),
      }),
      measureDirectory(
        this.releaseRoot ? path.join(this.releaseRoot, '.uploads') : undefined,
      ),
      measureDirectory(
        this.releaseRoot ? path.join(this.releaseRoot, '.runtime') : undefined,
      ),
      measureDirectory(this.logsRoot),
    ]);
    const knownUsageBytes =
      sourceRepositories +
      releaseArtifacts +
      temporaryUploads +
      runtimeData +
      logs;
    const filesystem = await filesystemUsage(
      this.releaseRoot ?? this.sourceRoot ?? process.cwd(),
    );
    const other = Math.max(0, filesystem.usedBytes - knownUsageBytes);
    const categories: HubStorageCategory[] = [
      category('sourceRepositories', sourceRepositories, 0, 'hub-managed'),
      category('releaseArtifacts', releaseArtifacts, 0, 'hub-managed'),
      category(
        'temporaryUploads',
        temporaryUploads,
        temporaryUploads,
        'hub-managed',
      ),
      category('runtimeData', runtimeData, 0, 'local-only'),
      category('logs', logs, 0, 'hub-managed'),
      category('otherFilesystemUsage', other, null, 'outside-hub', 'derived'),
    ];
    return {
      filesystem,
      knownUsageBytes,
      categories,
      measuredAt: new Date().toISOString(),
    };
  }
}

function category(
  key: string,
  bytes: number,
  reclaimableBytes: number | null,
  scope: string,
  accuracy: 'exact' | 'derived' = 'exact',
): HubStorageCategory {
  return {
    key,
    ...CATEGORY_META[key],
    bytes,
    reclaimableBytes,
    scope,
    accuracy,
  };
}

async function measureDirectory(
  root: string | undefined,
  options: { exclude?: Set<string> } = {},
): Promise<number> {
  if (!root) return 0;
  try {
    if (!(await lstat(root)).isDirectory()) return 0;
  } catch {
    return 0;
  }
  return walk(root, options.exclude ?? new Set(), new Set());
}

async function walk(
  directory: string,
  excluded: Set<string>,
  visited: Set<string>,
): Promise<number> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return 0;
  }
  let bytes = 0;
  for (const entry of entries) {
    if (excluded.has(entry.name)) continue;
    const entryPath = path.join(directory, entry.name);
    let info;
    try {
      info = await lstat(entryPath);
    } catch {
      continue;
    }
    if (info.isSymbolicLink()) continue;
    if (info.isDirectory()) {
      const identity = `${info.dev}:${info.ino}`;
      if (visited.has(identity)) continue;
      visited.add(identity);
      bytes += await walk(entryPath, excluded, visited);
    } else if (info.isFile()) {
      bytes += info.size;
    }
  }
  return bytes;
}

async function filesystemUsage(
  root: string,
): Promise<HubStorageMeasurement['filesystem']> {
  try {
    const info = await statfsCompat(root);
    const capacityBytes = Number(info.blocks) * Number(info.bsize);
    const availableBytes = Number(info.bavail) * Number(info.bsize);
    const usedBytes = Math.max(
      0,
      capacityBytes - Number(info.bfree) * Number(info.bsize),
    );
    return {
      capacityBytes,
      usedBytes,
      availableBytes,
      usedPercent: capacityBytes
        ? Number(((usedBytes / capacityBytes) * 100).toFixed(1))
        : 0,
    };
  } catch {
    return {
      capacityBytes: 0,
      usedBytes: 0,
      availableBytes: 0,
      usedPercent: 0,
    };
  }
}

async function statfsCompat(root: string): Promise<{
  bsize: number;
  blocks: number;
  bfree: number;
  bavail: number;
}> {
  const fsApi = await import('node:fs/promises');
  const result = await fsApi.statfs(root);
  return {
    bsize: result.bsize,
    blocks: result.blocks,
    bfree: result.bfree,
    bavail: result.bavail,
  };
}

function resolveOptionalRoot(value: string | undefined): string | undefined {
  return value?.trim() ? path.resolve(value) : undefined;
}

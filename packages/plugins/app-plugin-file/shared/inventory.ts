export const FILE_INVENTORY_RESOURCE: string = 'file.inventory';

export type FileInventorySourceStatus = 'available' | 'unavailable';

export interface FileInventorySourceSummary {
  readonly id: string;
  readonly table: string;
  readonly audiences: readonly string[];
  readonly registrations: number;
  readonly scoped: boolean;
  readonly count: number | null;
  readonly status: FileInventorySourceStatus;
  readonly error?: string;
}

export interface FileInventoryItem {
  readonly id: string;
  readonly disk: string;
  readonly filename: string;
  readonly mimeType: string;
  readonly size: number;
  readonly public: boolean;
  readonly createdAt: Date | string;
  readonly updatedAt: Date | string;
}

export interface FileInventorySourcesResponse {
  readonly data: readonly FileInventorySourceSummary[];
}

export interface FileInventoryFilesResponse {
  readonly data: readonly FileInventoryItem[];
  readonly meta: {
    readonly page: number;
    readonly pageSize: number;
    readonly total: number;
    readonly totalPages: number;
  };
}

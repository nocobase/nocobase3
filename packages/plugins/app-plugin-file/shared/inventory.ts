export const FILE_INVENTORY_RESOURCE: string = 'file.inventory';

export interface FileInventorySource {
  readonly id: string;
  readonly table: string;
}

export interface FileInventoryItem {
  readonly id: string;
  readonly disk: string;
  readonly filename: string;
  readonly mimeType: string;
  readonly size: number;
  readonly public: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface FileInventoryErrorResponse {
  readonly error: {
    readonly code: string;
    readonly message: string;
  };
}

export interface FileInventorySourcesResponse {
  readonly data: readonly FileInventorySource[];
}

export interface FileInventoryFilesResponse {
  readonly data: readonly FileInventoryItem[];
  readonly meta: {
    readonly pageSize: number;
    readonly hasNextPage: boolean;
    readonly nextCursor?: string;
  };
}

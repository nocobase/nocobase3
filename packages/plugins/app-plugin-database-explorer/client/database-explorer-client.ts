import type { ApiClient } from '@nocobase/app-client';

import type {
  CollectionDetail,
  CollectionListResult,
  ConnectionListResult,
  ListCollectionsQuery,
  PhysicalCollectionDetail,
} from '../server/types.js';

// The contract types are declared once, beside the routes that produce them.
// Every one is type-only, so nothing from `server/` reaches the client bundle.
export type {
  CollectionDetail,
  CollectionEntry,
  CollectionListResult,
  ConnectionListResult,
  ConnectionSummary,
  PhysicalCollectionDetail,
} from '../server/types.js';

interface DataResponse<T> {
  readonly data: T;
}

/** Typed reads against the plugin's endpoints. Every call is a GET; there is nothing to write. */
export class DatabaseExplorerClient {
  public constructor(private readonly api: ApiClient) {}

  public connections(): Promise<ConnectionListResult> {
    return this.get<ConnectionListResult>('database-explorer/connections');
  }

  public collections(
    connection: string,
    query: ListCollectionsQuery = {},
  ): Promise<CollectionListResult> {
    return this.get<CollectionListResult>(
      `${this.connectionPath(connection)}/collections`,
      {
        ...(query.limit === undefined ? {} : { limit: query.limit }),
        // Passed back exactly as issued: the cursor encodes the filter it was
        // created under and the server rejects a rewritten one.
        ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
      },
    );
  }

  public collection(
    connection: string,
    collection: string,
  ): Promise<CollectionDetail> {
    return this.get<CollectionDetail>(
      this.collectionPath(connection, collection),
    );
  }

  public physicalCollection(
    connection: string,
    collection: string,
  ): Promise<PhysicalCollectionDetail> {
    return this.get<PhysicalCollectionDetail>(
      `${this.collectionPath(connection, collection)}/physical`,
    );
  }

  private connectionPath(connection: string): string {
    return `database-explorer/connections/${encodeURIComponent(connection)}`;
  }

  private collectionPath(connection: string, collection: string): string {
    return `${this.connectionPath(connection)}/collections/${encodeURIComponent(collection)}`;
  }

  private get<T>(
    path: string,
    query: Readonly<Record<string, string | number>> = {},
  ): Promise<T> {
    return this.api
      .request<DataResponse<T>>({ path, query })
      .then(({ data }) => data);
  }
}

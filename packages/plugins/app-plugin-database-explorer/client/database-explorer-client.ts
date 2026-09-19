import type { ApiClient } from '@nocobase/app-client';

import type {
  CollectionDetail,
  CollectionEntry,
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

  /**
   * Reads every collection on a connection, following the cursor to the end.
   *
   * The page filters by name in the browser, which is only honest if it is
   * filtering the whole set: stopping at the first page would hide collections
   * a connection genuinely has and let a search come back empty for one of
   * them. `maxPages` bounds the walk so a connection that keeps issuing
   * cursors cannot hold the request open forever.
   */
  public async allCollections(
    connection: string,
    maxPages = 50,
  ): Promise<{
    readonly items: readonly CollectionEntry[];
    readonly truncated: boolean;
  }> {
    const items: CollectionEntry[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < maxPages; page += 1) {
      const result = await this.collections(
        connection,
        cursor === undefined ? {} : { cursor },
      );
      items.push(...result.items);
      cursor = result.nextCursor;
      if (cursor === undefined) return { items, truncated: false };
    }
    return { items, truncated: true };
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

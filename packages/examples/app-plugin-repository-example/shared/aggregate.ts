export type AggregateStatus =
  'all' | 'draft' | 'confirmed' | 'paid' | 'cancelled';
export interface AggregateRequest {
  readonly status: AggregateStatus;
  readonly minimumQuantity: number;
  readonly minimumGroupCount?: number;
}
export type AggregateScalar = number | string | null;
export interface AggregateSummary {
  readonly count: AggregateScalar;
  readonly quantity: AggregateScalar;
  readonly averagePrice: AggregateScalar;
  readonly minimumPrice: AggregateScalar;
  readonly maximumPrice: AggregateScalar;
}
export interface AggregateResponse {
  readonly summary: AggregateSummary;
  readonly statuses: readonly {
    readonly status: string;
    readonly count: AggregateScalar;
  }[];
  readonly products: readonly {
    readonly productId: string;
    readonly name: string;
    readonly sku: string;
    readonly count: AggregateScalar;
    readonly quantity: AggregateScalar;
    readonly averagePrice: AggregateScalar;
  }[];
  readonly customers: readonly {
    readonly id: string;
    readonly name: string;
    readonly orders: number;
  }[];
  readonly customerLimit: number;
}

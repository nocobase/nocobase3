export interface ResponseMetadataSnapshot {
  readonly messageId?: string;
  readonly metadata: Record<string, unknown>;
}

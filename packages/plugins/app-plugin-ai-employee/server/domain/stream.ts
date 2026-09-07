export interface ConversationStreamTarget {
  write(chunk: unknown): void;
  end(chunk?: unknown): void;
  readonly destroyed?: boolean;
  readonly writableEnded?: boolean;
}

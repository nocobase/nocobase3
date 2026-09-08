export interface Actor {
  readonly id: string | number;
  readonly roles: readonly string[];
  readonly isRoot: boolean;
  readonly locale?: string;
  readonly scope?: string;
}

export interface ModelRef {
  readonly llmService: string;
  readonly model: string;
}

export type Translate = (
  key: string,
  options?: Record<string, unknown>,
) => string;

export const identityTranslate: Translate = (key) => key;

export interface ConversationStreamTarget {
  write(chunk: unknown): void;
  end(chunk?: unknown): void;
  readonly destroyed?: boolean;
  readonly writableEnded?: boolean;
}

export const AI_API_BASE_PATH = '/api/ai' as const;
export type ManagedResourceKeyQuery = {
  key: string;
};

export type AIUserPromptUpdateInput = {
  aiEmployee: string;
  prompt?: string;
};

export type AIEmployeeResourceInput = Record<string, unknown>;
export type AIToolResourceInput = Record<string, unknown>;
export type AISkillResourceInput = Record<string, unknown>;
export type EnabledModelDto = { label: string; value: string };
export type EnabledModelsConfigDto = {
  mode: 'recommended' | 'provider' | 'custom';
  models: EnabledModelDto[];
};
export type LLMServiceDto = {
  name: string;
  title: string;
  provider: string;
  options: Record<string, unknown>;
  enabledModels: EnabledModelsConfigDto | string[] | null;
  enabled: boolean;
  modelOptions?: Record<string, unknown>;
  sort: number;
};
export type LLMServiceResourceInput = Partial<LLMServiceDto> & {
  name?: string;
};
export type ProviderModelListRequest = {
  llmService: string;
  search?: string;
};
export type ProviderModelDto = { id: string };
export type AIMCPServerResourceInput = Record<string, unknown>;

export type AIEmployeeDefinition = {
  username: string;
  nickname?: string;
  position?: string;
  bio?: string;
  greeting?: string;
  avatar?: string;
  category?: string;
  deprecated?: boolean;
  builtIn?: boolean;
  enabled?: boolean;
  systemPrompt?: string | null;
  chatSettings?: Record<string, unknown>;
  skillSettings?: {
    skills?: string[];
    tools?: Array<{ name: string; autoCall?: boolean }>;
  };
  modelSettings?: {
    enabled?: boolean;
    llmService?: string;
    model?: string;
    models?: ModelRef[];
  };
  tools?: Array<{ name: string; autoCall?: boolean }>;
  skills?: string[];
};

export type AIStreamEvent = Record<string, unknown>;

export type AIEmployeeDto = {
  username: string;
  nickname: string;
  position?: string;
  bio?: string;
  greeting?: string;
  description?: string;
  avatar?: string;
  category?: string;
  deprecated?: boolean;
  builtIn?: boolean;
  userConfig?: { prompt?: string; sort?: number };
  chatSettings?: Record<string, unknown>;
  skillSettings?: {
    skills?: string[];
    tools?: Array<{ name: string; autoCall?: boolean }>;
  };
  modelSettings?: {
    enabled?: boolean;
    llmService?: string;
    model?: string;
    models?: ModelRef[];
  };
};

export type EnabledLLMServiceDto = {
  llmService: string;
  llmServiceTitle: string;
  provider: string;
  providerTitle?: string;
  enabledModels: Array<{ label: string; value: string }>;
  supportWebSearch: boolean;
  webSearchModels?: string[];
  isToolConflict: boolean;
};

export type CreateConversationRequest = {
  aiEmployee: AIEmployeeDto | AIEmployeeDefinition;
  systemMessage?: string;
  skillSettings?: { skills?: string[]; tools?: string[] };
  modelSettings: ModelRef;
  scope?: string;
};

export type IncomingAttachmentRef = {
  id?: string | number;
  uid?: string;
  filename: string;
  size?: number;
  mimetype?: string;
  url?: string;
  preview?: string;
  source?: {
    dataSourceKey?: string;
    collectionName?: string;
    field?: string;
    documentCache?: boolean;
  };
  [key: string]: unknown;
};

export type IncomingChatMessage = {
  key?: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: { type: string; content: unknown };
  attachments?: IncomingAttachmentRef[];
  workContext?: Array<Record<string, unknown>>;
  metadata?: Record<string, unknown>;
  toolCalls?: Array<Record<string, unknown>>;
};

export type SendMessagesRequest = {
  sessionId: string;
  aiEmployee: string;
  model: ModelRef;
  systemMessage?: string;
  skillSettings?: { skills?: string[]; tools?: string[] };
  messages: IncomingChatMessage[];
  editingMessageId?: string;
  webSearch?: boolean;
};

export type ResendMessagesRequest = {
  sessionId: string;
  messageId?: string;
  model: ModelRef;
  webSearch?: boolean;
};

export type ToolCallDecision =
  | { type: 'approve' }
  | { type: 'reject'; message?: string }
  | { type: 'edit'; editedAction: { name: string; args: unknown } };

export type UpdateToolCallDecisionRequest = {
  sessionId: string;
  messageId: string;
  toolCallId: string;
  userDecision: ToolCallDecision;
};

export type ResumeToolCallRequest = {
  sessionId: string;
  messageId?: string;
  toolCallIds?: string[];
  toolCallResults?: Array<{ id: string; result: unknown }>;
  model: ModelRef;
  webSearch?: boolean;
};

export type DomainErrorCode =
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'CONFLICT'
  | 'INFRASTRUCTURE_ERROR';

export class DomainError extends Error {
  public constructor(
    public readonly code: DomainErrorCode,
    message: string,
    public readonly status: number,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'DomainError';
  }
}

export function validationError(message: string): DomainError {
  return new DomainError('VALIDATION_ERROR', message, 400);
}

export function notFoundError(message: string): DomainError {
  return new DomainError('NOT_FOUND', message, 404);
}

export function forbiddenError(message: string): DomainError {
  return new DomainError('FORBIDDEN', message, 403);
}

export function infrastructureError(
  message: string,
  cause?: unknown,
): DomainError {
  return new DomainError('INFRASTRUCTURE_ERROR', message, 500, { cause });
}

export function sendStreamError(
  target: ConversationStreamTarget,
  error: Error | string,
  errorName?: string,
): void {
  const body =
    typeof error === 'string' ? error : error.message || 'Unknown error';
  target.write(
    `data: ${JSON.stringify({ type: 'error', body, errorName })}\n\n`,
  );
  target.end();
}

export class ResourceActionError extends DomainError {
  public constructor(status: number, message: string, options?: ErrorOptions) {
    super(
      status === 403
        ? 'FORBIDDEN'
        : status === 404
          ? 'NOT_FOUND'
          : status === 409
            ? 'CONFLICT'
            : status >= 500
              ? 'INFRASTRUCTURE_ERROR'
              : 'VALIDATION_ERROR',
      message,
      status,
      options,
    );
    this.name = 'ResourceActionError';
  }
}

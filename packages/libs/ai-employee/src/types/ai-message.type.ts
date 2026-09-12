/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

export type AIMessage = {
  messageId: string;
  sessionId: string;
  role: string;
  createdAt?: string | Date;
  content: any;
  toolCalls?: AIToolCall[];
  attachments?: unknown[];
  workContext?: WorkContext[];
  metadata?: any;
};

export type WorkContext = {
  type: string;
  uid: string;
  title?: string;
  content?: unknown;
  [key: string]: unknown;
};

export type AIMessageContent = {
  type?: string;
  content: any;
  reference?: { title: string; url: string }[];
  reasoning?: unknown;
  tool_calls?: AIToolCall[];
  subAgentConversations?: unknown[];
  from?: string;
  [key: string]: unknown;
};

export type AIToolCall = {
  id: string;
  name: string;
  type: string;
  args: unknown;
  [key: string]: any;
};

export type AIMessageMetadata = {
  model?: string;
  provider?: string;
  usage_metadata?: any;
  response_metadata?: any;
  additional_kwargs?: Record<string, unknown>;
  toolCall?: AIToolCall;
  autoCallTools?: string[];
  autoCall?: boolean;
  interrupted?: boolean;
  subAgentConversations?: SubAgentConversationMetadata[];

  [key: string]: unknown;
};

export type SubAgentConversationMetadata = {
  sessionId: string;
  toolCallId: string;
  status: 'pending' | 'completed';
};

export type AIToolMessage = Record<string, any>;

export type UserDecision = {
  type: 'approve' | 'edit' | 'reject';
  message?: string;
  editedAction?: {
    name: string;
    args: any;
  };
};

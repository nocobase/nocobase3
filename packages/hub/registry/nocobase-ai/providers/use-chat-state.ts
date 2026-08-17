import type { Chat } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import { useCallback, useSyncExternalStore } from "react";

const MESSAGE_THROTTLE_MS = 32;

export function useChatState<CHAT_MESSAGE extends UIMessage>(
  chat: Chat<CHAT_MESSAGE>
) {
  const subscribeToMessages = useCallback(
    (onStoreChange: () => void) =>
      chat["~registerMessagesCallback"](
        onStoreChange,
        MESSAGE_THROTTLE_MS
      ),
    [chat]
  );
  const subscribeToStatus = useCallback(
    (onStoreChange: () => void) =>
      chat["~registerStatusCallback"](onStoreChange),
    [chat]
  );
  const subscribeToError = useCallback(
    (onStoreChange: () => void) =>
      chat["~registerErrorCallback"](onStoreChange),
    [chat]
  );
  const getMessages = useCallback(() => chat.messages, [chat]);
  const getStatus = useCallback(() => chat.status, [chat]);
  const getError = useCallback(() => chat.error, [chat]);

  return {
    messages: useSyncExternalStore(
      subscribeToMessages,
      getMessages,
      getMessages
    ),
    status: useSyncExternalStore(subscribeToStatus, getStatus, getStatus),
    error: useSyncExternalStore(subscribeToError, getError, getError),
  };
}

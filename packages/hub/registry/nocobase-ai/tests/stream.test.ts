import { describe, expect, it } from "vitest";

import { NocoBaseClient } from "@nocobase/portal-sdk/client";
import { NocoBaseChatTransport } from "../providers/chat-transport";
import { StreamCoalescer } from "../providers/stream-coalescer";
import { SubAgentStreamAccumulator } from "../providers/sub-agent-stream";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const encodeSSE = (events: unknown[]) => {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(
        encoder.encode(
          events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("")
        )
      );
      controller.close();
    },
  });
};

const collectStream = async (stream: ReadableStream) => {
  const result: unknown[] = [];
  const reader = stream.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    result.push(value);
  }
  return result as Array<Record<string, any>>;
};

describe("AI streaming", () => {
  it("resolves server assets and coalesces small text chunks", async () => {
    const client = new NocoBaseClient("http://localhost:13001/api");
    expect(client.resolveUrl("/files/main/main/aiFiles/5.png?preview=1")).toBe(
      "http://localhost:13001/files/main/main/aiFiles/5.png?preview=1"
    );

    const flushed: Array<[string, string]> = [];
    const coalescer = new StreamCoalescer<string, string>({
      interval: 20,
      maxSize: 100,
      getSize: (value) => value.length,
      merge: (current, incoming) => current + incoming,
      onFlush: (key, value) => flushed.push([key, value]),
    });
    coalescer.push("message", "hello ");
    coalescer.push("message", "world");
    await wait(35);
    expect(flushed).toEqual([["message", "hello world"]]);
  });

  it("continues persisted sub-agent output", () => {
    const accumulator = new SubAgentStreamAccumulator({
      id: "assistant-existing",
      role: "assistant",
      parts: [
        {
          type: "data-subAgent",
          id: "sub-1",
          data: {
            sessionId: "sub-1",
            username: "viz",
            status: "pending",
            messages: [
              {
                id: "sub-message",
                role: "assistant",
                parts: [{ type: "text", text: "saved ", state: "done" }],
              },
            ],
          },
        },
      ],
    } as any);
    const [chunk] = accumulator.process({
      type: "content",
      body: "tail",
      from: "sub-agent",
      sessionId: "sub-1",
      username: "viz",
    });
    if (chunk.type !== "data-subAgent") {
      throw new Error("Expected a sub-agent data chunk");
    }
    const textPart = chunk.data.messages[0].parts[0];
    if (textPart.type !== "text") {
      throw new Error("Expected sub-agent text output");
    }
    expect(textPart.text).toBe("saved tail");
  });

  it("passes page context from user messages to the service", async () => {
    let request: any;
    const service = {
      sendMessagesStream: async (input: unknown) => {
        request = input;
        return encodeSSE([
          { type: "content", body: "ok", from: "main-agent" },
          { type: "stream_end", from: "main-agent" },
        ]);
      },
    };
    const transport = new NocoBaseChatTransport({
      service: service as any,
      getContext: () => ({
        sessionId: "conversation-context",
        employee: { username: "mira", nickname: "Mira" },
        model: { value: "test", label: "Test" },
      }),
    });
    await collectStream(
      await transport.sendMessages({
        messages: [
          {
            id: "user-context",
            role: "user",
            metadata: {
              workContext: [
                {
                  type: "page-element",
                  id: "customer-form",
                  title: "Customer form",
                },
              ],
            },
            parts: [{ type: "text", text: "Review this form" }],
          },
        ],
      } as any)
    );
    expect(request.messages[0].workContext).toEqual([
      {
        type: "page-element",
        id: "customer-form",
        title: "Customer form",
      },
    ]);
  });
});

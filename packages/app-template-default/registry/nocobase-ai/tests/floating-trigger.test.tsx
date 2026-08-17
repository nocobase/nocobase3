import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  open: vi.fn(),
  triggerTask: vi.fn(),
}));

vi.mock("../providers", () => ({
  useAI: () => ({ employees: [{ username: "atlas" }] }),
  useAIChatControllerState: () => ({ open: false }),
  useGlobalAIChatController: () => ({
    open: mocks.open,
    triggerTask: mocks.triggerTask,
  }),
}));

vi.mock("../locales/use-ai-translate", () => ({
  useAITranslate: () => (_key: string, fallback: string) => fallback,
}));

import {
  AIChatFloatingTrigger,
  clampFloatingTriggerTop,
} from "../components/triggers/ai-chat-floating-trigger";

describe("AIChatFloatingTrigger", () => {
  beforeEach(() => {
    mocks.open.mockClear();
    mocks.triggerTask.mockClear();
  });

  it("clamps its vertical position inside the available viewport", () => {
    expect(clampFloatingTriggerTop(-20, 12, 700)).toBe(12);
    expect(clampFloatingTriggerTop(320, 12, 700)).toBe(320);
    expect(clampFloatingTriggerTop(900, 12, 700)).toBe(700);
  });

  it("moves vertically without opening chat", () => {
    const { container } = render(<AIChatFloatingTrigger />);
    const dragHandle = container.querySelector<HTMLElement>(
      '[data-slot="ai-chat-drag-handle"]'
    );
    const trigger = screen.getByRole("button", { name: "Open AI chat" });

    expect(dragHandle).not.toBeNull();
    if (!dragHandle) throw new Error("AI chat drag handle was not rendered");

    Object.defineProperty(dragHandle, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        bottom: 562,
        height: 62,
        left: 0,
        right: 80,
        top: 500,
        width: 80,
        x: 0,
        y: 500,
        toJSON: () => ({}),
      }),
    });
    Object.defineProperty(dragHandle, "setPointerCapture", {
      configurable: true,
      value: vi.fn(),
    });
    Object.defineProperty(dragHandle, "releasePointerCapture", {
      configurable: true,
      value: vi.fn(),
    });

    fireEvent.pointerDown(dragHandle, {
      button: 0,
      clientY: 500,
      pointerId: 1,
      pointerType: "mouse",
    });
    fireEvent.pointerMove(dragHandle, {
      clientY: 300,
      pointerId: 1,
      pointerType: "mouse",
    });
    fireEvent.pointerUp(dragHandle, {
      clientY: 300,
      pointerId: 1,
      pointerType: "mouse",
    });
    fireEvent.click(dragHandle);

    expect(dragHandle.style.top).toBe("300px");
    expect(mocks.triggerTask).not.toHaveBeenCalled();

    fireEvent.click(trigger);
    expect(mocks.triggerTask).toHaveBeenCalledWith({
      aiEmployee: "atlas",
      open: true,
    });
  });
});

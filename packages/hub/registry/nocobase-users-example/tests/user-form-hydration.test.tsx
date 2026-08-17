import { act, renderHook, waitFor } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { describe, expect, it } from "vitest";

import { getUserFormValues } from "../form-context";
import type { UserFormValues, UserRecord } from "../types";
import { useUserFormHydration } from "../use-user-form-hydration";

function useHydratedForm({ id, record }: { id: string; record: UserRecord }) {
  const form = useForm<UserFormValues>({ defaultValues: getUserFormValues() });
  useUserFormHydration({ form, id, record });
  return form;
}

describe("useUserFormHydration", () => {
  it("hydrates once per user and preserves dirty edits across query refreshes", async () => {
    const alice = { id: 1, nickname: "Alice", username: "alice" };
    const { result, rerender } = renderHook(useHydratedForm, {
      initialProps: { id: "1", record: alice },
    });

    await waitFor(() => expect(result.current.getValues("nickname")).toBe("Alice"));
    act(() => result.current.setValue("nickname", "Unsaved draft"));

    rerender({
      id: "1",
      record: { ...alice, nickname: "Alice from refreshed query" },
    });
    expect(result.current.getValues("nickname")).toBe("Unsaved draft");

    rerender({
      id: "2",
      record: { id: 2, nickname: "Bob", username: "bob" },
    });
    await waitFor(() => expect(result.current.getValues("nickname")).toBe("Bob"));
  });
});

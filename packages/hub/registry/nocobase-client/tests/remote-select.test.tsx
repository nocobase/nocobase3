import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Drawer as DrawerPrimitive } from "@base-ui/react/drawer";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState, type ReactElement } from "react";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { RemoteSelect } from "../remote-select";

type Option = { id: number; label: string };

function RemoteMultiSelect({
  debounceMs = 0,
  loadOptions,
}: {
  debounceMs?: number;
  loadOptions: (params: {
    search: string;
    page: number;
    pageSize: number;
    signal: AbortSignal;
  }) => Promise<{ items: Option[]; hasMore: boolean }>;
}) {
  const [value, setValue] = useState<Option[]>([]);
  return (
    <RemoteSelect<Option>
      multiple
      value={value}
      onValueChange={(nextValue) => setValue(nextValue)}
      loadOptions={loadOptions}
      getOptionKey={(option) => option.id}
      getOptionLabel={(option) => option.label}
      debounceMs={debounceMs}
      messages={{ searchPlaceholder: "Search options..." }}
    />
  );
}

function renderRemoteSelect(element: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{element}</QueryClientProvider>
  );
}

describe("RemoteSelect", () => {
  beforeAll(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    );
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
  });

  afterAll(() => {
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
    vi.unstubAllGlobals();
  });

  it("loads options on demand and appends the next page", async () => {
    const loadOptions = vi.fn(async ({ page }: { page: number }) => ({
      items:
        page === 1
          ? [{ id: 1, label: "One" }]
          : [{ id: 2, label: "Two" }],
      hasMore: page === 1,
    }));
    const user = userEvent.setup();
    renderRemoteSelect(<RemoteMultiSelect loadOptions={loadOptions} />);

    expect(loadOptions).not.toHaveBeenCalled();
    await user.click(screen.getByRole("combobox"));
    expect(await screen.findByRole("option", { name: "One" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Load more" }));

    expect(await screen.findByRole("option", { name: "Two" })).toBeTruthy();
    expect(loadOptions).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ page: 2, search: "" })
    );
  });

  it("portals the option menu outside clipping containers", async () => {
    const loadOptions = vi.fn(async () => ({
      items: [{ id: 1, label: "Visible option" }],
      hasMore: false,
    }));
    const user = userEvent.setup();
    renderRemoteSelect(
      <div data-testid="clipping-container" style={{ overflow: "hidden" }}>
        <RemoteMultiSelect loadOptions={loadOptions} />
      </div>
    );

    await user.click(screen.getByRole("combobox"));
    const option = await screen.findByRole("option", { name: "Visible option" });

    expect(screen.getByTestId("clipping-container").contains(option)).toBe(false);
    expect(
      option.closest("[data-side]")?.parentElement?.classList.contains("z-[70]")
    ).toBe(true);
  });

  it("keeps portaled options interactive inside a route-style drawer", async () => {
    const loadOptions = vi.fn(async () => ({
      items: [{ id: 1, label: "Selectable role" }],
      hasMore: false,
    }));
    const user = userEvent.setup();

    renderRemoteSelect(
      <>
        <style>{`.pointer-events-auto { pointer-events: auto; }`}</style>
        <DrawerPrimitive.Root open>
          <DrawerPrimitive.Portal style={{ pointerEvents: "none" }}>
            <DrawerPrimitive.Viewport>
              <DrawerPrimitive.Popup style={{ pointerEvents: "auto" }}>
                <DrawerPrimitive.Title>Manage user</DrawerPrimitive.Title>
                <DrawerPrimitive.Content>
                  <RemoteMultiSelect loadOptions={loadOptions} />
                </DrawerPrimitive.Content>
              </DrawerPrimitive.Popup>
            </DrawerPrimitive.Viewport>
          </DrawerPrimitive.Portal>
        </DrawerPrimitive.Root>
      </>
    );

    const trigger = screen.getByRole("combobox");
    await user.click(trigger);
    await user.click(
      await screen.findByRole("option", { name: "Selectable role" })
    );

    expect(trigger.textContent).toContain("Selectable role");
  });

  it("delegates debounced searching to the loader", async () => {
    const loadOptions = vi.fn(async () => ({ items: [], hasMore: false }));
    const user = userEvent.setup();
    renderRemoteSelect(<RemoteMultiSelect loadOptions={loadOptions} />);

    await user.click(screen.getByRole("combobox"));
    await screen.findByText("No results found.");
    await user.type(screen.getByPlaceholderText("Search options..."), "sales");

    await waitFor(() =>
      expect(loadOptions).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 1, search: "sales" })
      )
    );
  });

  it("keeps the selected record label after a different search is loaded", async () => {
    const loadOptions = vi.fn(async ({ search }: { search: string }) => ({
      items: search
        ? [{ id: 2, label: "Second result" }]
        : [{ id: 1, label: "First result" }],
      hasMore: false,
    }));
    const user = userEvent.setup();
    renderRemoteSelect(<RemoteMultiSelect loadOptions={loadOptions} />);

    const trigger = screen.getByRole("combobox");
    await user.click(trigger);
    await user.click(
      await screen.findByRole("option", { name: "First result" })
    );
    await user.type(screen.getByPlaceholderText("Search options..."), "next");
    await screen.findByRole("option", { name: "Second result" });

    expect(trigger.textContent).toContain("First result");
  });

  it("retries the failed operation instead of inferring it from cached pages", async () => {
    let firstPageRequests = 0;
    const loadOptions = vi.fn(({ page }: { page: number }) => {
      if (page !== 1) {
        return Promise.resolve({
          items: [{ id: 2, label: "Second page" }],
          hasMore: false,
        });
      }

      firstPageRequests += 1;
      if (firstPageRequests === 2) {
        return Promise.reject(new Error("Unable to refresh"));
      }
      return Promise.resolve({
        items: [{ id: 1, label: "First page" }],
        hasMore: true,
      });
    });
    const user = userEvent.setup();
    renderRemoteSelect(<RemoteMultiSelect loadOptions={loadOptions} />);

    const trigger = screen.getByRole("combobox");
    await user.click(trigger);
    expect(
      await screen.findByRole("option", { name: "First page" })
    ).toBeTruthy();
    await user.click(trigger);
    await user.click(trigger);
    expect(await screen.findByText("Options could not be loaded.")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(firstPageRequests).toBe(3));
    expect(loadOptions).not.toHaveBeenCalledWith(
      expect.objectContaining({ page: 2 })
    );
  });

  it("clears a pending debounced search before the menu is reopened", async () => {
    const loadOptions = vi.fn(async ({ search }: { search: string }) => ({
      items: search ? [{ id: 1, label: `Result for ${search}` }] : [],
      hasMore: false,
    }));
    const user = userEvent.setup();
    renderRemoteSelect(
      <RemoteMultiSelect debounceMs={50} loadOptions={loadOptions} />
    );

    const trigger = screen.getByRole("combobox");
    await user.click(trigger);
    const input = screen.getByPlaceholderText("Search options...");
    await user.type(input, "legacy");
    expect(
      await screen.findByRole("option", { name: "Result for legacy" })
    ).toBeTruthy();

    await user.click(trigger);
    await user.click(trigger);

    expect(
      (screen.getByPlaceholderText("Search options...") as HTMLInputElement)
        .value
    ).toBe("");
    expect(
      screen.queryByRole("option", { name: "Result for legacy" })
    ).toBeNull();
    await waitFor(() =>
      expect(loadOptions).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 1, search: "" })
      )
    );
  });

  it("does not let a stale search response replace newer results", async () => {
    let resolveSlow:
      | ((result: { items: Option[]; hasMore: boolean }) => void)
      | undefined;
    const slowResult = new Promise<{ items: Option[]; hasMore: boolean }>(
      (resolve) => {
        resolveSlow = resolve;
      }
    );
    const loadOptions = vi.fn(({ search }: { search: string }) => {
      if (search === "slow") return slowResult;
      return Promise.resolve({
        items:
          search === "fast" ? [{ id: 2, label: "Fast result" }] : [],
        hasMore: false,
      });
    });
    const user = userEvent.setup();
    renderRemoteSelect(<RemoteMultiSelect loadOptions={loadOptions} />);

    await user.click(screen.getByRole("combobox"));
    const input = screen.getByPlaceholderText("Search options...");
    await user.type(input, "slow");
    await waitFor(() =>
      expect(loadOptions).toHaveBeenCalledWith(
        expect.objectContaining({ search: "slow" })
      )
    );

    await user.clear(input);
    await user.type(input, "fast");
    expect(
      await screen.findByRole("option", { name: "Fast result" })
    ).toBeTruthy();

    await act(async () => {
      resolveSlow?.({
        items: [{ id: 1, label: "Stale result" }],
        hasMore: false,
      });
    });

    await waitFor(() => {
      expect(screen.queryByRole("option", { name: "Stale result" })).toBeNull();
      expect(screen.getByRole("option", { name: "Fast result" })).toBeTruthy();
    });
  });
});

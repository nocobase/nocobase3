import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router";

import { RouteOverlayViewportContext } from "@nocobase/portal-sdk/routing";
import { RouteDialog } from "@/extensions/nocobase-route-surfaces";

describe("Route overlay viewport", () => {
  it("applies the reserved side region to the rendered route surface portal", async () => {
    render(
      <MemoryRouter>
        <RouteOverlayViewportContext.Provider value={{ inlineEnd: 450 }}>
          <RouteDialog title="Details" closeLabel="Close" closeTo="/">
            <div>Dialog content</div>
          </RouteDialog>
        </RouteOverlayViewportContext.Provider>
      </MemoryRouter>
    );

    expect(
      await screen.findByRole("dialog", { name: "Details" })
    ).toBeTruthy();
    expect(
      document.querySelector<HTMLElement>(
        '[style*="--route-overlay-inline-end"]'
      )
    ).toHaveStyle("--route-overlay-inline-end: 450px");
  });
});

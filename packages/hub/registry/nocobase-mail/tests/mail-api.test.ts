import { afterEach, describe, expect, it, vi } from "vitest";

import { nocobaseClient } from "@nocobase/portal-sdk/client";
import { mailApi } from "../components/mail-api";

afterEach(() => vi.restoreAllMocks());

describe("Mail API adapter", () => {
  it("maps mutations to the server actions expected by the plugin", async () => {
    const action = vi
      .spyOn(nocobaseClient, "action")
      .mockResolvedValue({} as never);

    await mailApi.cancelScheduled(7);
    await mailApi.destroyMessages([7, 8]);
    await mailApi.cancelMassMessage(9);
    await mailApi.resendMassMessage(9);

    expect(action.mock.calls.map(([resource, name]) => [resource, name])).toEqual(
      [
        ["mailMessages", "cancelTimelySend"],
        ["mailMessages", "destroy"],
        ["mailMassMessages", "cancel"],
        ["mailMassMessages", "resend"],
      ]
    );
    expect(action.mock.calls[0][2]?.query).toEqual({ id: 7 });
    expect(action.mock.calls[1][2]?.query).toEqual({ filterByTk: [7, 8] });
  });

  it("loads all pages of bulk messages", async () => {
    const action = vi.spyOn(nocobaseClient, "action").mockImplementation(
      async (_resource, _name, options) => {
        const page = Number(options?.query?.page ?? 1);
        return {
          data:
            page === 1
              ? Array.from({ length: 100 }, (_, index) => ({ id: index + 1 }))
              : [{ id: 101 }],
          meta: { count: 101 },
        } as never;
      }
    );

    const result = await mailApi.listMassMessages(null);
    expect(result.count).toBe(101);
    expect(result.rows).toHaveLength(101);
    expect(action).toHaveBeenCalledTimes(2);
  });
});

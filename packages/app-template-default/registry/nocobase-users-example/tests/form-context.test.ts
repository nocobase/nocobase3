import { describe, expect, it } from "vitest";

import {
  getAIUserFormValues,
  getUserFormValues,
  normalizeUserFormValues,
} from "../form-context";

describe("user form values", () => {
  it("submits roles using the NocoBase association shape", () => {
    expect(
      normalizeUserFormValues({
        nickname: "Alice",
        username: "alice",
        email: "alice@example.com",
        phone: "10086",
        roles: [
          { name: "admin", title: "Admin" },
          { name: "member", title: "Member" },
        ],
      }).roles
    ).toEqual([{ name: "admin" }, { name: "member" }]);
  });

  it("does not expose role assignment to AI Form filler", () => {
    expect(
      getAIUserFormValues({
        nickname: "Alice",
        username: "alice",
        email: "alice@example.com",
        phone: "10086",
        roles: [{ name: "admin" }],
      })
    ).not.toHaveProperty("roles");
  });

  it("hydrates edit fields and preserves associated role labels", () => {
    expect(
      getUserFormValues({
        id: 7,
        nickname: "Alice",
        username: "alice",
        email: "alice@example.com",
        phone: "10086",
        roles: [
          { name: "admin", title: "Admin" },
          { name: "member", title: "Member" },
        ],
      })
    ).toEqual({
      nickname: "Alice",
      username: "alice",
      email: "alice@example.com",
      phone: "10086",
      roles: [
        { name: "admin", title: "Admin" },
        { name: "member", title: "Member" },
      ],
    });
  });

  it("does not invent an empty role assignment when roles were not returned", () => {
    const values = getUserFormValues({
      id: 7,
      nickname: "Alice",
      username: "alice",
    });

    expect(values).not.toHaveProperty("roles");
    expect(normalizeUserFormValues(values)).not.toHaveProperty("roles");
  });
});

import { describe, expect, it } from "vitest";
import {
  Authorization,
  condition,
  filter,
  MemoryAuthorizationStore,
  type ActionPermission,
  type MemoryAuthorizationStoreOptions,
} from "../src/index.js";

const principal = { id: "alice" };

function createAuthorization(
  actions: readonly ActionPermission[],
  options: Omit<
    MemoryAuthorizationStoreOptions,
    "permissionSets" | "assignments"
  > = {},
  attributes?: Readonly<Record<string, string>>,
) {
  const store = new MemoryAuthorizationStore({
    ...options,
    permissionSets: [
      {
        key: "orders-user",
        permissions: [{ resource: "orders", actions }],
      },
    ],
    assignments: [
      {
        id: "assignment-1",
        subject: { type: "user", id: principal.id },
        target: { type: "permissionSet", key: "orders-user" },
      },
    ],
  });
  const authorization = new Authorization({ store });
  authorization.resources.register({
    name: "orders",
    actions: ["read", "create", "update", "delete", "approve"],
    fields: {
      id: { type: "scalar" },
      ownerId: { type: "scalar" },
      department: { type: "scalar" },
      amount: { type: "scalar" },
    },
    ...(attributes ? { attributes } : {}),
  });
  return authorization;
}

function action(
  actionName: string,
  recordScope?: ActionPermission["recordScope"],
): ActionPermission {
  return {
    action: actionName,
    inputFields:
      actionName === "create" || actionName === "update" ? ["amount"] : [],
    outputFields: ["id", "ownerId", "department", "amount"],
    ...(recordScope ? { recordScope } : {}),
  };
}

describe("record access semantics", () => {
  it("never lets OWD create a missing Object Permission capability", async () => {
    const authorization = createAuthorization([action("read")], {
      organizationWideDefaults: { orders: { access: "publicReadWrite" } },
    });
    await expect(
      authorization.can(principal, { resource: "orders", action: "update" }),
    ).resolves.toBe(false);
  });

  it("denies a private resource with no positive record scope", async () => {
    const authorization = createAuthorization([action("read")]);
    await expect(
      authorization.can(principal, { resource: "orders", action: "read" }),
    ).resolves.toBe(false);
  });

  it("adds implicit owner access only when the resource declares owner semantics", async () => {
    const authorization = createAuthorization(
      [action("read")],
      {},
      { owner: "ownerId" },
    );
    await expect(
      authorization.can(principal, {
        resource: "orders",
        action: "read",
        record: { ownerId: "alice" },
      }),
    ).resolves.toBe(true);
    await expect(
      authorization.can(principal, {
        resource: "orders",
        action: "read",
        record: { ownerId: "bob" },
      }),
    ).resolves.toBe(false);
  });

  it("maps OWD to standard record actions without granting delete or custom actions", async () => {
    const readOnly = createAuthorization([action("read"), action("update")], {
      organizationWideDefaults: { orders: { access: "publicReadOnly" } },
    });
    await expect(
      readOnly.can(principal, { resource: "orders", action: "read" }),
    ).resolves.toBe(true);
    await expect(
      readOnly.can(principal, { resource: "orders", action: "update" }),
    ).resolves.toBe(false);

    const readWrite = createAuthorization(
      [action("read"), action("update"), action("delete"), action("approve")],
      {
        organizationWideDefaults: { orders: { access: "publicReadWrite" } },
      },
    );
    await expect(
      readWrite.can(principal, { resource: "orders", action: "read" }),
    ).resolves.toBe(true);
    await expect(
      readWrite.can(principal, { resource: "orders", action: "update" }),
    ).resolves.toBe(true);
    await expect(
      readWrite.can(principal, { resource: "orders", action: "delete" }),
    ).resolves.toBe(false);
    await expect(
      readWrite.can(principal, { resource: "orders", action: "approve" }),
    ).resolves.toBe(false);
  });

  it("authorizes create from capability and input fields without an existing-record filter", async () => {
    const authorization = createAuthorization([action("create")]);
    await expect(
      authorization.can(principal, {
        resource: "orders",
        action: "create",
        fields: { input: ["amount"] },
      }),
    ).resolves.toBe(true);
    await expect(
      authorization.can(principal, {
        resource: "orders",
        action: "create",
        fields: { input: ["ownerId"] },
      }),
    ).resolves.toBe(false);
  });

  it("unions direct, criteria, and explicit-record sharing scopes and ignores expired rules", async () => {
    const authorization = createAuthorization(
      [action("read", [{ policy: "recordsIOwn" }])],
      {
        sharingRules: [
          {
            key: "sales-orders",
            resource: "orders",
            actions: ["read"],
            subjects: [{ type: "user", id: "alice" }],
            records: {
              type: "criteria",
              scopes: [
                {
                  policy: "customCriteria",
                  params: {
                    filter: filter(
                      "orders",
                      condition("department", "$eq", "sales"),
                    ),
                  },
                },
              ],
            },
          },
          {
            key: "explicit-order",
            resource: "orders",
            actions: ["read"],
            subjects: [{ type: "user", id: "alice" }],
            records: { type: "records", ids: ["order-42"] },
          },
          {
            key: "expired-order",
            resource: "orders",
            actions: ["read"],
            subjects: [{ type: "user", id: "alice" }],
            records: { type: "records", ids: ["expired-order"] },
            expiresAt: new Date("2026-01-01T00:00:00Z"),
          },
        ],
      },
      { owner: "ownerId", identifier: "id" },
    );

    const now = new Date("2026-08-18T00:00:00Z");
    for (const record of [
      { id: "owned", ownerId: "alice", department: "support" },
      { id: "shared-by-criteria", ownerId: "bob", department: "sales" },
      { id: "order-42", ownerId: "bob", department: "support" },
    ]) {
      await expect(
        authorization.can(principal, {
          resource: "orders",
          action: "read",
          record,
          now,
        }),
      ).resolves.toBe(true);
    }
    await expect(
      authorization.can(principal, {
        resource: "orders",
        action: "read",
        record: { id: "expired-order", ownerId: "bob", department: "support" },
        now,
      }),
    ).resolves.toBe(false);
  });

  it("intersects every positive grant with Restriction Rules and never treats a restriction as a grant", async () => {
    const restrictionRules = [
      {
        key: "sales-only",
        resource: "orders",
        actions: ["read"],
        subjects: [{ type: "user" as const, id: "alice" }],
        scopes: [
          {
            policy: "customCriteria",
            params: {
              filter: filter("orders", condition("department", "$eq", "sales")),
            },
          },
        ],
      },
    ];
    const authorization = createAuthorization([action("read")], {
      organizationWideDefaults: { orders: { access: "publicReadOnly" } },
      restrictionRules,
    });
    await expect(
      authorization.can(principal, {
        resource: "orders",
        action: "read",
        record: { department: "sales" },
      }),
    ).resolves.toBe(true);
    await expect(
      authorization.can(principal, {
        resource: "orders",
        action: "read",
        record: { department: "support" },
      }),
    ).resolves.toBe(false);

    const restrictionOnly = createAuthorization([action("read")], {
      restrictionRules,
    });
    await expect(
      restrictionOnly.can(principal, {
        resource: "orders",
        action: "read",
        record: { department: "sales" },
      }),
    ).resolves.toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { CollectionBuilder } from "../../../src/index.js";

describe("CollectionBuilder view collections", () => {
  it("creates view collections from structured query DSL", async () => {
    const builder = new CollectionBuilder();

    const result = await builder.createViewCollection(
      "usersView",
      (view) => {
        view.tableName("users_view");
        view.title("Adult users");
        view.description("Users older than 18.");
        view.string("firstName", { columnName: "first_name" });
        view.as((query) =>
          query.from("users").select("firstName").where("age", ">", 18),
        );
      },
      { dryRun: true },
    );

    expect(result.operations[0]).toMatchObject({
      type: "createViewCollection",
      name: "usersView",
      definition: {
        kind: "view",
        writable: false,
        tableName: "users_view",
        title: "Adult users",
        description: "Users older than 18.",
      },
    });
    expect(result.schemaOperations?.[0]).toMatchObject({
      type: "createView",
      view: {
        name: "users_view",
        columns: ["first_name"],
        query: {
          from: "users",
          select: ["first_name"],
          filter: {
            age: {
              $gt: 18,
            },
          },
        },
      },
    });
  });

  it("replaces view collections and supports raw SQL as an escape hatch", async () => {
    const builder = new CollectionBuilder();

    const result = await builder.replaceViewCollection(
      "usersView",
      (view) => {
        view.tableName("users_view");
        view.string("firstName", { columnName: "first_name" });
        view.asRaw("select first_name from users where age > ?", [18]);
      },
      { dryRun: true },
    );

    expect(result.operations[0]).toMatchObject({
      type: "replaceViewCollection",
      definition: {
        kind: "view",
        writable: false,
        view: {
          asRaw: {
            sql: "select first_name from users where age > ?",
            bindings: [18],
          },
        },
      },
    });
    expect(result.schemaOperations?.[0]).toMatchObject({
      type: "createView",
      orReplace: true,
      view: {
        raw: {
          sql: "select first_name from users where age > ?",
          bindings: [18],
        },
      },
    });
  });

  it("creates and refreshes materialized view collections", async () => {
    const builder = new CollectionBuilder();

    const createResult = await builder.createMaterializedViewCollection(
      "usersSnapshot",
      (view) => {
        view.tableName("users_snapshot");
        view.string("firstName", { columnName: "first_name" });
        view.as((query) =>
          query.from("users").select("firstName").where("age", ">", 18),
        );
        view.refresh({ strategy: "manual" });
        view.index(["firstName"], { name: "idx_users_snapshot_first_name" });
      },
      { dryRun: true },
    );

    expect(createResult.operations[0]).toMatchObject({
      type: "createMaterializedViewCollection",
      definition: {
        kind: "materializedView",
        writable: false,
        view: {
          refresh: {
            strategy: "manual",
          },
        },
      },
    });
    expect(createResult.schemaOperations?.[0]).toMatchObject({
      type: "createView",
      materialized: true,
      view: {
        indexes: [
          {
            columns: ["first_name"],
            name: "idx_users_snapshot_first_name",
          },
        ],
      },
    });

    const refreshResult = await builder.refreshMaterializedViewCollection(
      "usersSnapshot",
      {
        concurrently: true,
        dryRun: true,
      },
    );

    expect(refreshResult.operations).toEqual([
      {
        type: "refreshMaterializedViewCollection",
        collection: "usersSnapshot",
        concurrently: true,
      },
    ]);
    expect(refreshResult.schemaOperations).toEqual([
      {
        type: "refreshMaterializedView",
        viewName: "users_snapshot",
        concurrently: true,
      },
    ]);
  });
});

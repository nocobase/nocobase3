import type { BuilderResult, CollectionBuilder } from "@nocobase/database";

/** Stores the default record visibility for each resource. It never grants an Object capability. */
export function createOrganizationWideDefaultCollection(
  builder: CollectionBuilder,
): Promise<BuilderResult> {
  return builder.createCollection(
    "authzOrganizationWideDefaults",
    (collection) => {
      collection.string("id", { length: 64 }).notNull();
      collection.string("resource", { length: 255 }).notNull();
      collection
        .string("access", { length: 32 })
        .notNull()
        .defaultTo("private");
      collection.datetime("createdAt").notNull();
      collection.datetime("updatedAt").notNull();

      collection.primary("id", { name: "pk_authz_organization_wide_defaults" });
      collection.unique("resource", {
        name: "uq_authz_organization_wide_defaults_resource",
      });
    },
  );
}

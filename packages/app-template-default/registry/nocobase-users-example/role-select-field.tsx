import { nocobaseClient } from "@nocobase/portal-sdk/client";
import type { useTranslate } from "@refinedev/core";
import type { UseFormReturn } from "react-hook-form";

import { CanAccess } from "@/components/access-control/can-access";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  RemoteSelect,
  type RemoteSelectLoadParams,
  type RemoteSelectLoadResult,
} from "@/extensions/nocobase-client";
import { resolveRoleLabel } from "./role-utils";
import type { RoleRecord, UserFormValues } from "./types";

type Translate = ReturnType<typeof useTranslate>;

type RoleListEnvelope = {
  data?:
    | RoleRecord[]
    | {
        rows?: RoleRecord[];
        count?: number;
      };
  rows?: RoleRecord[];
  count?: number;
  meta?: {
    count?: number;
  };
};

function parseRoleList(payload: unknown) {
  if (Array.isArray(payload)) {
    return { rows: payload as RoleRecord[], count: payload.length };
  }
  if (!payload || typeof payload !== "object") {
    return { rows: [], count: 0 };
  }

  const envelope = payload as RoleListEnvelope;
  if (Array.isArray(envelope.data)) {
    return {
      rows: envelope.data,
      count: envelope.meta?.count ?? envelope.data.length,
    };
  }
  if (envelope.data && !Array.isArray(envelope.data)) {
    const rows = envelope.data.rows ?? [];
    return { rows, count: envelope.data.count ?? rows.length };
  }

  const rows = envelope.rows ?? [];
  return { rows, count: envelope.count ?? rows.length };
}

async function loadRoleOptions({
  page,
  pageSize,
  search,
  signal,
}: RemoteSelectLoadParams): Promise<RemoteSelectLoadResult<RoleRecord>> {
  const conditions: Record<string, unknown>[] = [
    { name: { $ne: "root" } },
  ];
  if (search) {
    conditions.push({
      $or: [
        { name: { $includes: search } },
        { title: { $includes: search } },
      ],
    });
  }

  const payload = await nocobaseClient.action<unknown>("roles", "list", {
    query: {
      page,
      pageSize,
      filter: JSON.stringify(
        conditions.length === 1 ? conditions[0] : { $and: conditions }
      ),
      sort: "name",
    },
    signal,
    unwrap: "none",
  });
  const { rows, count } = parseRoleList(payload);

  return {
    items: rows.filter((role) => role.name && role.name !== "root"),
    hasMore: page * pageSize < count,
  };
}

export function UserRolesField({
  action,
  form,
  translate,
}: {
  action: "create" | "edit";
  form: UseFormReturn<UserFormValues>;
  translate: Translate;
}) {
  return (
    <CanAccess resource="roles" action="list">
      <CanAccess resource="users" action={action} field="roles">
        <FormField
          control={form.control}
          name="roles"
          render={({ field }) => {
            const roles = field.value ?? [];
            const protectedRoles = roles.filter((role) => role.name === "root");
            const selectedRoles = roles.filter((role) => role.name !== "root");

            return (
              <FormItem>
                <FormLabel>
                  {translate("users.fields.roles", { ns: "app" }, "Roles")}
                </FormLabel>
                <FormControl
                  render={
                    <RemoteSelect<RoleRecord>
                      multiple
                      value={selectedRoles}
                      onValueChange={(nextRoles) =>
                        field.onChange([...protectedRoles, ...nextRoles])
                      }
                      onBlur={field.onBlur}
                      requestKey={["roles"]}
                      loadOptions={loadRoleOptions}
                      getOptionKey={(role) => role.name}
                      getOptionLabel={resolveRoleLabel}
                      popupSide="top"
                      placeholder={translate(
                        "users.form.roles.placeholder",
                        { ns: "app" },
                        "Select roles..."
                      )}
                      messages={{
                        searchPlaceholder: translate(
                          "users.form.roles.search",
                          { ns: "app" },
                          "Search roles..."
                        ),
                        empty: translate(
                          "users.filters.roles.noResults",
                          { ns: "app" },
                          "No roles found."
                        ),
                        loading: translate(
                          "users.form.roles.loading",
                          { ns: "app" },
                          "Loading roles..."
                        ),
                        loadMore: translate(
                          "users.form.roles.loadMore",
                          { ns: "app" },
                          "Load more"
                        ),
                        loadingMore: translate(
                          "users.form.roles.loadingMore",
                          { ns: "app" },
                          "Loading more..."
                        ),
                        error: translate(
                          "users.form.roles.loadError",
                          { ns: "app" },
                          "Role options could not be loaded. Existing assignments will be preserved."
                        ),
                        retry: translate(
                          "runtimeError.retry",
                          { ns: "starter" },
                          "Retry"
                        ),
                      }}
                    />
                  }
                />
                <FormMessage />
              </FormItem>
            );
          }}
        />
      </CanAccess>
    </CanAccess>
  );
}

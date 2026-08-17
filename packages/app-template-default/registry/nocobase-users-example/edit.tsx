import { type HttpError, useOne, useTranslate } from "@refinedev/core";
import { useForm } from "@refinedev/react-hook-form";
import { useMemo } from "react";
import { useParams } from "react-router";
import { useCanAccess } from "@nocobase/portal-sdk/acl";
import { useRouteSurfaceClose } from "@nocobase/portal-sdk/routing";

import { AccessDenied } from "@/components/access-control/access-denied";
import { CanAccess } from "@/components/access-control/can-access";
import { LoadingState } from "@/components/app-shell/loading-state";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { useAIForm, type AIFormField } from "./optional-ai";
import {
  RouteDrawer,
  RouteDrawerFooter,
  useRefineUnsavedChangesGuard,
} from "@/extensions/nocobase-route-surfaces";
import {
  applyAIUserFormValues,
  getAIUserFormFields,
  getAIUserFormValues,
  getUserFormValues,
  normalizeUserFormValues,
} from "./form-context";
import { UserFormFields } from "./form-fields";
import { getUserShowPath, userRoutes } from "./routes";
import type { UserFormValues, UserRecord } from "./types";
import { useUserFormHydration } from "./use-user-form-hydration";

export const UserEdit = ({
  returnTo = "list",
}: {
  returnTo?: "list" | "show";
}) => {
  const translate = useTranslate();
  const { id } = useParams<{ id: string }>();
  const closeTo =
    returnTo === "show" && id ? getUserShowPath(id) : userRoutes.list;
  const { beforeClose, confirmation } = useRefineUnsavedChangesGuard();

  return (
    <>
      <RouteDrawer
        title={translate("users.drawer.edit.title", { ns: "app" }, "Edit user")}
        description={translate(
          "users.drawer.edit.description",
          { ns: "app" },
          "Update this user's identity and contact information."
        )}
        closeLabel={translate("buttons.close", "Close")}
        closeTo={closeTo}
        beforeClose={beforeClose}
      >
        <UserEditForm id={id} />
      </RouteDrawer>
      {confirmation}
    </>
  );
};

function UserEditForm({ id }: { id?: string }) {
  const translate = useTranslate();
  const close = useRouteSurfaceClose();
  const canListRoles = useCanAccess({ resource: "roles", action: "list" });
  const canEditRoles = useCanAccess({
    resource: "users",
    action: "edit",
    field: "roles",
  });
  const canManageRoles = canListRoles && canEditRoles;
  const { result: record, query: userQuery } = useOne<UserRecord>({
    resource: "users",
    id,
    meta: canManageRoles ? { appends: ["roles"] } : undefined,
  });
  const {
    refineCore: { onFinish },
    ...form
  } = useForm<UserRecord, HttpError, UserFormValues>({
    refineCoreProps: {
      action: "edit",
      resource: "users",
      id,
      redirect: false,
      queryOptions: { enabled: false },
      onMutationSuccess: () => {
        close({ skipBeforeClose: true });
      },
    },
    defaultValues: getUserFormValues(),
  });
  useUserFormHydration({ form, id, record });
  const aiFields = useMemo<AIFormField[]>(
    () => getAIUserFormFields(translate),
    [translate]
  );
  const aiFormRef = useAIForm({
    id: `users-edit-form-${id ?? "current"}`,
    title: translate("users.ai.editForm", { ns: "app" }, "Edit user form"),
    fields: aiFields,
    getValues: () => getAIUserFormValues(form.getValues()),
    setValues: (values) => applyAIUserFormValues(form, values),
  });

  return (
    <Form {...form}>
      <form
        ref={aiFormRef}
        onSubmit={form.handleSubmit((values) =>
          onFinish(normalizeUserFormValues(values))
        )}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5 [&_[data-slot=input]]:h-10 [&_[data-slot=select-trigger]]:h-10 [&_[data-slot=textarea]]:min-h-56">
          {userQuery.isLoading ? (
            <LoadingState className="min-h-64" />
          ) : userQuery.isError ? (
            <Alert variant="destructive">
              <AlertTitle>
                {translate(
                  "users.detail.loadError.title",
                  { ns: "app" },
                  "Unable to load user"
                )}
              </AlertTitle>
              <AlertDescription>
                {translate(
                  "users.detail.loadError.description",
                  { ns: "app" },
                  "The user may no longer exist, or you may not have permission to view it."
                )}
              </AlertDescription>
            </Alert>
          ) : (
            <UserFormFields form={form} roleAction="edit" translate={translate} />
          )}
        </div>
        <RouteDrawerFooter className="flex-row justify-end">
          <Button type="button" variant="outline" onClick={() => close()}>
            {translate("users.form.cancel", { ns: "app" }, "Cancel")}
          </Button>
          <Button
            type="submit"
            disabled={
              userQuery.isLoading ||
              userQuery.isError ||
              form.saveButtonProps.disabled ||
              form.formState.isSubmitting
            }
          >
            {form.formState.isSubmitting
              ? translate(
                  "users.form.edit.submitting",
                  { ns: "app" },
                  "Saving..."
                )
              : translate(
                  "users.form.edit.submit",
                  { ns: "app" },
                  "Save changes"
                )}
          </Button>
        </RouteDrawerFooter>
      </form>
    </Form>
  );
}

export default function UserEditRoute() {
  return (
    <CanAccess resource="users" action="edit" fallback={<AccessDenied />}>
      <UserEdit />
    </CanAccess>
  );
}

export function UserShowEditRoute() {
  return (
    <CanAccess resource="users" action="edit" fallback={<AccessDenied />}>
      <UserEdit returnTo="show" />
    </CanAccess>
  );
}

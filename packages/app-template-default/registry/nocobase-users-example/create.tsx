import { type HttpError, useTranslate } from "@refinedev/core";
import { useForm } from "@refinedev/react-hook-form";
import { useMemo } from "react";
import { useRouteSurfaceClose } from "@nocobase/portal-sdk/routing";

import { AccessDenied } from "@/components/access-control/access-denied";
import { CanAccess } from "@/components/access-control/can-access";
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
import { userRoutes } from "./routes";
import type { UserFormValues, UserRecord } from "./types";

export const UserCreate = () => {
  const translate = useTranslate();
  const { beforeClose, confirmation } = useRefineUnsavedChangesGuard();

  return (
    <>
      <RouteDrawer
        title={translate(
          "users.drawer.create.title",
          { ns: "app" },
          "Create user"
        )}
        description={translate(
          "users.drawer.create.description",
          { ns: "app" },
          "Add a user who can sign in to this NocoBase application."
        )}
        closeLabel={translate("buttons.close", "Close")}
        closeTo={userRoutes.list}
        beforeClose={beforeClose}
      >
        <UserCreateForm />
      </RouteDrawer>
      {confirmation}
    </>
  );
};

function UserCreateForm() {
  const translate = useTranslate();
  const close = useRouteSurfaceClose();
  const {
    refineCore: { onFinish },
    ...form
  } = useForm<UserRecord, HttpError, UserFormValues>({
    refineCoreProps: {
      resource: "users",
      action: "create",
      redirect: false,
      onMutationSuccess: () => {
        close({ skipBeforeClose: true });
      },
    },
    defaultValues: {
      ...getUserFormValues(),
      password: "",
    },
  });
  const aiFields = useMemo<AIFormField[]>(
    () => getAIUserFormFields(translate),
    [translate]
  );
  const aiFormRef = useAIForm({
    id: "users-create-form",
    title: translate("users.ai.createForm", { ns: "app" }, "Create user form"),
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
          <UserFormFields
            form={form}
            includePassword
            roleAction="create"
            translate={translate}
          />
        </div>
        <RouteDrawerFooter className="flex-row justify-end">
          <Button type="button" variant="outline" onClick={() => close()}>
            {translate("users.form.cancel", { ns: "app" }, "Cancel")}
          </Button>
          <Button
            type="submit"
            disabled={
              form.saveButtonProps.disabled || form.formState.isSubmitting
            }
          >
            {form.formState.isSubmitting
              ? translate(
                  "users.form.create.submitting",
                  { ns: "app" },
                  "Creating..."
                )
              : translate(
                  "users.form.create.submit",
                  { ns: "app" },
                  "Create user"
                )}
          </Button>
        </RouteDrawerFooter>
      </form>
    </Form>
  );
}

export default function UserCreateRoute() {
  return (
    <CanAccess resource="users" action="create" fallback={<AccessDenied />}>
      <UserCreate />
    </CanAccess>
  );
}

import { AlertCircle, KeyRound } from "lucide-react";
import { Fragment, Suspense, useEffect, useMemo } from "react";
import {
  usePublicAuthenticators,
  type Authenticator,
  type RenderAuthenticator,
} from "@nocobase/portal-sdk/auth";

import { authenticatorAdapterMap } from "@/components/auth/authenticator-adapters";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { resolveTranslatableText } from "@nocobase/portal-sdk/i18n";

type DynamicSignInProps = {
  renderAuthenticator?: RenderAuthenticator;
};

type ResolvedAuthenticator = {
  authenticator: Authenticator;
  placement: "form" | "button";
  element: React.ReactNode;
};

function AuthenticatorFallback() {
  return (
    <div className="flex min-h-32 items-center justify-center">
      <Spinner className="size-5 text-muted-foreground" />
    </div>
  );
}

export function DynamicSignIn({
  renderAuthenticator,
}: DynamicSignInProps) {
  const { data: authenticators = [], error, isPending } =
    usePublicAuthenticators();

  const unsupportedAuthTypes = useMemo(
    () =>
      Array.from(
        new Set(
          authenticators
            .filter(
              (authenticator) =>
                !authenticatorAdapterMap.has(authenticator.authType)
            )
            .map((authenticator) => authenticator.authType)
        )
      ),
    [authenticators]
  );

  useEffect(() => {
    if (!import.meta.env.DEV || unsupportedAuthTypes.length === 0) return;
    console.warn(
      `[auth] No frontend adapter is installed for: ${unsupportedAuthTypes.join(
        ", "
      )}`
    );
  }, [unsupportedAuthTypes]);

  const resolved = useMemo<ResolvedAuthenticator[]>(() => {
    return authenticators.flatMap((authenticator) => {
      const adapter = authenticatorAdapterMap.get(authenticator.authType);
      if (!adapter) return [];

      const Component = adapter.Component;
      const defaultElement = (
        <Suspense fallback={<AuthenticatorFallback />}>
          <Component authenticator={authenticator} />
        </Suspense>
      );
      const element = renderAuthenticator
        ? renderAuthenticator({ authenticator, adapter, defaultElement })
        : defaultElement;

      if (element === null || element === false || element === undefined) {
        return [];
      }

      return [{ authenticator, placement: adapter.placement, element }];
    });
  }, [authenticators, renderAuthenticator]);

  if (isPending) {
    return (
      <div className="flex min-h-64 items-center justify-center">
        <Spinner className="size-6 text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle />
        <AlertTitle>Unable to load sign-in methods</AlertTitle>
        <AlertDescription>
          {import.meta.env.DEV && error instanceof Error
            ? error.message
            : "Please try again or contact your administrator."}
        </AlertDescription>
      </Alert>
    );
  }

  const forms = resolved.filter((item) => item.placement === "form");
  const buttons = resolved.filter((item) => item.placement === "button");

  if (resolved.length === 0) {
    return (
      <Empty className="min-h-64 border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <KeyRound />
          </EmptyMedia>
          <EmptyTitle>No supported sign-in methods</EmptyTitle>
          <EmptyDescription>
            No sign-in method is currently available. Contact your
            administrator for access.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="space-y-6">
      {forms.length === 1 ? (
        forms[0].element
      ) : forms.length > 1 ? (
        <Tabs defaultValue={forms[0].authenticator.name}>
          <TabsList className="w-full">
            {forms.map(({ authenticator }) => (
              <TabsTrigger
                key={authenticator.name}
                value={authenticator.name}
              >
                {resolveTranslatableText(
                  authenticator.title ||
                    authenticator.authTypeTitle ||
                    authenticator.authType
                )}
              </TabsTrigger>
            ))}
          </TabsList>
          {forms.map(({ authenticator, element }) => (
            <TabsContent
              key={authenticator.name}
              value={authenticator.name}
            >
              {element}
            </TabsContent>
          ))}
        </Tabs>
      ) : null}

      {buttons.length > 0 && (
        <Fragment>
          {forms.length > 0 && (
            <div className="flex items-center gap-4 py-1">
              <Separator className="flex-1" />
              <span className="text-xs text-muted-foreground">
                Or continue with
              </span>
              <Separator className="flex-1" />
            </div>
          )}
          <div className="grid gap-3">
            {buttons.map(({ authenticator, element }) => (
              <Fragment key={authenticator.name}>{element}</Fragment>
            ))}
          </div>
        </Fragment>
      )}
    </div>
  );
}

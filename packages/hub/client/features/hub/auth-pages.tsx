import { AlertCircle, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { useLogin } from "@refinedev/core";
import { Navigate, useLocation, useNavigate } from "react-router";

import { AuthLayout } from "@/components/auth/auth-layout";
import { InputPassword } from "@/components/auth/input-password";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { hubPost, type HubFetcher, useHubQuery } from "./api";
import { HubErrorState, HubLoadingState } from "./components";

interface HubSetupStatus {
  setupRequired: boolean;
  ownerConfigured: boolean;
}

interface LoginVariables {
  identifier: string;
  password: string;
  redirectTo?: string;
}

export function HubLoginPage({ fetcher }: { fetcher?: HubFetcher }) {
  const location = useLocation();
  const setup = useHubQuery<HubSetupStatus>({
    path: "/setup/status",
    fetcher,
  });
  if (setup.loading) return <HubLoadingState label="Checking Hub setup" />;
  if (setup.error) {
    return (
      <div className="mx-auto flex min-h-svh max-w-xl items-center px-6">
        <HubErrorState
          error={setup.error}
          onRetry={setup.reload}
          title="Unable to check Hub setup"
        />
      </div>
    );
  }
  if (setup.data?.setupRequired) return <Navigate to="/setup" replace />;

  return (
    <AuthLayout
      title="Sign in to NocoBase Hub"
      description="Use your Hub username or email. Application users are managed separately."
    >
      <HubLoginForm
        redirectTo={readLoginRedirect(location.state)}
        ownerCreated={readOwnerCreated(location.state)}
      />
    </AuthLayout>
  );
}

function HubLoginForm({
  redirectTo,
  ownerCreated,
}: {
  redirectTo: string;
  ownerCreated: boolean;
}) {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const { mutate: login, isPending, data } = useLogin<LoginVariables>();
  const error = data && !data.success ? data.error : undefined;

  return (
    <form
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        login({ identifier, password, redirectTo });
      }}
    >
      {ownerCreated ? (
        <Alert>
          <ShieldCheck aria-hidden="true" />
          <AlertTitle>Owner created</AlertTitle>
          <AlertDescription>
            Owner created. Sign in to continue.
          </AlertDescription>
        </Alert>
      ) : null}
      {error ? (
        <Alert variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertTitle>Unable to sign in</AlertTitle>
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      ) : null}
      <div className="space-y-2">
        <Label htmlFor="hub-identifier">Username or email</Label>
        <Input
          id="hub-identifier"
          value={identifier}
          onChange={(event) => setIdentifier(event.target.value)}
          autoComplete="username"
          autoFocus
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="hub-password">Password</Label>
        <InputPassword
          id="hub-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
          required
        />
      </div>
      <Button className="w-full" type="submit" disabled={isPending}>
        {isPending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}

export function HubSetupPage({ fetcher }: { fetcher?: HubFetcher }) {
  const navigate = useNavigate();
  const setup = useHubQuery<HubSetupStatus>({
    path: "/setup/status",
    fetcher,
  });
  const { mutateAsync: login, isPending: signingIn } =
    useLogin<LoginVariables>();
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  if (setup.loading) return <HubLoadingState label="Checking Hub setup" />;
  if (setup.error) {
    return (
      <div className="mx-auto flex min-h-svh max-w-xl items-center px-6">
        <HubErrorState error={setup.error} onRetry={setup.reload} />
      </div>
    );
  }
  if (setup.data && !setup.data.setupRequired) {
    return <Navigate to="/login" replace />;
  }

  return (
    <AuthLayout
      title="Initialize NocoBase Hub"
      description="Create the first Owner. Public registration stays disabled after setup."
      footer={
        <div className="flex items-start gap-2 text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            The Owner controls Hub members, applications, releases, and
            deployments.
          </span>
        </div>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          setSubmitting(true);
          setError(null);
          void hubPost(
            "/setup/owner",
            { name, username: username || undefined, email, password },
            fetcher,
          )
            .then(async () => {
              try {
                const result = await login({
                  identifier: email,
                  password,
                  redirectTo: "/apps",
                });
                if (result.success) return;
              } catch {
                // Owner creation is already committed; recover through login.
              }
              void navigate("/login", {
                replace: true,
                state: { ownerCreated: true },
              });
            })
            .catch((reason: unknown) => {
              setError(
                reason instanceof Error ? reason : new Error(String(reason)),
              );
            })
            .finally(() => setSubmitting(false));
        }}
      >
        {error ? (
          <Alert variant="destructive">
            <AlertCircle aria-hidden="true" />
            <AlertTitle>Unable to create the Owner</AlertTitle>
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        ) : null}
        <div className="space-y-2">
          <Label htmlFor="hub-owner-name">Name</Label>
          <Input
            id="hub-owner-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoComplete="name"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="hub-owner-username">Username</Label>
          <Input
            id="hub-owner-username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="hub-owner-email">Email</Label>
          <Input
            id="hub-owner-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="hub-owner-password">Password</Label>
          <InputPassword
            id="hub-owner-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
            minLength={12}
            required
          />
        </div>
        <Button
          className="w-full"
          type="submit"
          disabled={submitting || signingIn}
        >
          {submitting || signingIn ? "Creating Owner…" : "Create Owner"}
        </Button>
      </form>
    </AuthLayout>
  );
}

function readLoginRedirect(state: unknown): string {
  if (!state || typeof state !== "object") return "/";
  const from = (state as { from?: unknown }).from;
  if (!from || typeof from !== "object") return "/";
  const location = from as {
    pathname?: unknown;
    search?: unknown;
    hash?: unknown;
  };
  if (
    typeof location.pathname !== "string" ||
    !location.pathname.startsWith("/") ||
    location.pathname.startsWith("//") ||
    location.pathname === "/login" ||
    location.pathname === "/setup"
  ) {
    return "/";
  }
  const search =
    typeof location.search === "string" && location.search.startsWith("?")
      ? location.search
      : "";
  const hash =
    typeof location.hash === "string" && location.hash.startsWith("#")
      ? location.hash
      : "";
  return `${location.pathname}${search}${hash}`;
}

function readOwnerCreated(state: unknown): boolean {
  return Boolean(
    state &&
    typeof state === "object" &&
    (state as { ownerCreated?: unknown }).ownerCreated === true,
  );
}

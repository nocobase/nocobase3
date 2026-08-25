import { AlertCircle, CheckCircle2, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLogin, useTranslate } from '@refinedev/core';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';

import { AuthLayout } from '@/components/auth/auth-layout';
import { InputPassword } from '@/components/auth/input-password';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  hubPost,
  type HubAcceptedInvitationMember,
  type HubAgentAuthorization,
  type HubAgentAuthorizationDecision,
  type HubFetcher,
  type HubResolvedInvitation,
  useHubQuery,
} from './api';
import { formatHubDate, HubErrorState, HubLoadingState } from './components';

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
  const translate = useTranslate();
  const location = useLocation();
  const setup = useHubQuery<HubSetupStatus>({
    path: '/setup/status',
    fetcher,
  });
  if (setup.loading) {
    return (
      <HubLoadingState
        label={translate('hub.auth.setup.checking', 'Checking Hub setup')}
      />
    );
  }
  if (setup.error) {
    return (
      <div className='mx-auto flex min-h-svh max-w-xl items-center px-6'>
        <HubErrorState
          error={setup.error}
          onRetry={setup.reload}
          title={translate(
            'hub.auth.setup.checkError',
            'Unable to check Hub setup',
          )}
        />
      </div>
    );
  }
  if (setup.data?.setupRequired) return <Navigate to='/setup' replace />;

  return (
    <AuthLayout
      title={translate('hub.auth.signIn.title', 'Sign in to NocoBase Hub')}
      description={translate(
        'hub.auth.signIn.description',
        'Use your Hub username or email. Application users are managed separately.',
      )}
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
  const translate = useTranslate();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const { mutate: login, isPending, data } = useLogin<LoginVariables>();
  const error = data && !data.success ? data.error : undefined;

  return (
    <form
      className='space-y-5'
      onSubmit={(event) => {
        event.preventDefault();
        login({ identifier, password, redirectTo });
      }}
    >
      {ownerCreated ? (
        <Alert>
          <ShieldCheck aria-hidden='true' />
          <AlertTitle>
            {translate('hub.auth.signIn.ownerCreated.title', 'Owner created')}
          </AlertTitle>
          <AlertDescription>
            {translate(
              'hub.auth.signIn.ownerCreated.description',
              'Owner created. Sign in to continue.',
            )}
          </AlertDescription>
        </Alert>
      ) : null}
      {error ? (
        <Alert variant='destructive'>
          <AlertCircle aria-hidden='true' />
          <AlertTitle>
            {translate('hub.auth.signIn.error', 'Unable to sign in')}
          </AlertTitle>
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      ) : null}
      <div className='space-y-2'>
        <Label htmlFor='hub-identifier'>
          {translate('hub.auth.signIn.identifier', 'Username or email')}
        </Label>
        <Input
          id='hub-identifier'
          value={identifier}
          onChange={(event) => setIdentifier(event.target.value)}
          autoComplete='username'
          autoFocus
          required
        />
      </div>
      <div className='space-y-2'>
        <Label htmlFor='hub-password'>
          {translate('hub.auth.signIn.password', 'Password')}
        </Label>
        <InputPassword
          id='hub-password'
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete='current-password'
          required
        />
      </div>
      <Button className='w-full' type='submit' disabled={isPending}>
        {isPending
          ? translate('hub.auth.signIn.submitting', 'Signing in…')
          : translate('hub.auth.signIn.submit', 'Sign in')}
      </Button>
    </form>
  );
}

export function HubSetupPage({ fetcher }: { fetcher?: HubFetcher }) {
  const translate = useTranslate();
  const navigate = useNavigate();
  const setup = useHubQuery<HubSetupStatus>({
    path: '/setup/status',
    fetcher,
  });
  const { mutateAsync: login, isPending: signingIn } =
    useLogin<LoginVariables>();
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  if (setup.loading) {
    return (
      <HubLoadingState
        label={translate('hub.auth.setup.checking', 'Checking Hub setup')}
      />
    );
  }
  if (setup.error) {
    return (
      <div className='mx-auto flex min-h-svh max-w-xl items-center px-6'>
        <HubErrorState error={setup.error} onRetry={setup.reload} />
      </div>
    );
  }
  if (setup.data && !setup.data.setupRequired) {
    return <Navigate to='/login' replace />;
  }

  return (
    <AuthLayout
      title={translate('hub.auth.setup.title', 'Initialize NocoBase Hub')}
      description={translate(
        'hub.auth.setup.description',
        'Create the first Owner. Public registration stays disabled after setup.',
      )}
      footer={
        <div className='flex items-start gap-2 text-muted-foreground'>
          <ShieldCheck className='mt-0.5 size-4 shrink-0' aria-hidden='true' />
          <span>
            {translate(
              'hub.auth.setup.footer',
              'The Owner controls Hub members, applications, releases, and deployments.',
            )}
          </span>
        </div>
      }
    >
      <form
        className='space-y-4'
        onSubmit={(event) => {
          event.preventDefault();
          setSubmitting(true);
          setError(null);
          void hubPost(
            '/setup/owner',
            { name, username: username || undefined, email, password },
            fetcher,
          )
            .then(async () => {
              try {
                const result = await login({
                  identifier: email,
                  password,
                  redirectTo: '/apps',
                });
                if (result.success) return;
              } catch {
                // Owner creation is already committed; recover through login.
              }
              void navigate('/login', {
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
          <Alert variant='destructive'>
            <AlertCircle aria-hidden='true' />
            <AlertTitle>
              {translate(
                'hub.auth.setup.createError',
                'Unable to create the Owner',
              )}
            </AlertTitle>
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        ) : null}
        <div className='space-y-2'>
          <Label htmlFor='hub-owner-name'>
            {translate('hub.auth.setup.name', 'Name')}
          </Label>
          <Input
            id='hub-owner-name'
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoComplete='name'
            required
          />
        </div>
        <div className='space-y-2'>
          <Label htmlFor='hub-owner-username'>
            {translate('hub.auth.setup.username', 'Username')}
          </Label>
          <Input
            id='hub-owner-username'
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete='username'
          />
        </div>
        <div className='space-y-2'>
          <Label htmlFor='hub-owner-email'>
            {translate('hub.auth.setup.email', 'Email')}
          </Label>
          <Input
            id='hub-owner-email'
            type='email'
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete='email'
            required
          />
        </div>
        <div className='space-y-2'>
          <Label htmlFor='hub-owner-password'>
            {translate('hub.auth.setup.password', 'Password')}
          </Label>
          <InputPassword
            id='hub-owner-password'
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete='new-password'
            minLength={12}
            required
          />
        </div>
        <Button
          className='w-full'
          type='submit'
          disabled={submitting || signingIn}
        >
          {submitting || signingIn
            ? translate('hub.auth.setup.creating', 'Creating Owner…')
            : translate('hub.auth.setup.create', 'Create Owner')}
        </Button>
      </form>
    </AuthLayout>
  );
}

export function HubInvitationAcceptancePage({
  fetcher,
}: {
  fetcher?: HubFetcher;
}) {
  const translate = useTranslate();
  const location = useLocation();
  const token = readInvitationToken(location.hash);
  const [invitation, setInvitation] = useState<HubResolvedInvitation | null>(
    null,
  );
  const [resolveError, setResolveError] = useState<Error | null>(null);
  const [resolveRevision, setResolveRevision] = useState(0);
  const [resolving, setResolving] = useState(Boolean(token));
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<Error | null>(null);
  const [member, setMember] = useState<HubAcceptedInvitationMember | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    if (!token) {
      setResolving(false);
      setResolveError(
        new Error(
          translate(
            'hub.auth.invitation.missingToken',
            'This invitation link is incomplete.',
          ),
        ),
      );
      return () => {
        cancelled = true;
      };
    }
    setResolving(true);
    setResolveError(null);
    void hubPost<HubResolvedInvitation>(
      '/invitation-acceptance/resolve',
      { token },
      fetcher,
    )
      .then((result) => {
        if (!cancelled) setInvitation(result.data);
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setResolveError(
            reason instanceof Error ? reason : new Error(String(reason)),
          );
        }
      })
      .finally(() => {
        if (!cancelled) setResolving(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fetcher, resolveRevision, token, translate]);

  const title = translate('hub.auth.invitation.title', 'Accept Hub invitation');
  const description = invitation
    ? translate(
        'hub.auth.invitation.description',
        { hub: invitation.hubDisplayName },
        `Create your account to join ${invitation.hubDisplayName}.`,
      )
    : translate(
        'hub.auth.invitation.resolvingDescription',
        'Verify the invitation and create your Hub account.',
      );

  if (resolving) {
    return (
      <AuthLayout title={title} description={description}>
        <HubLoadingState
          label={translate(
            'hub.auth.invitation.resolving',
            'Checking invitation',
          )}
        />
      </AuthLayout>
    );
  }

  if (resolveError || !invitation) {
    return (
      <AuthLayout title={title} description={description}>
        <HubErrorState
          error={resolveError}
          title={translate(
            'hub.auth.invitation.resolveError',
            'Unable to use this invitation',
          )}
          onRetry={
            token ? () => setResolveRevision((value) => value + 1) : undefined
          }
        />
      </AuthLayout>
    );
  }

  if (member) {
    return (
      <AuthLayout
        title={translate(
          'hub.auth.invitation.success.title',
          'Your Hub account is ready',
        )}
        description={translate(
          'hub.auth.invitation.success.description',
          'Sign in with the username and password you just created.',
        )}
      >
        <Alert>
          <CheckCircle2 aria-hidden='true' />
          <AlertTitle>{member.name}</AlertTitle>
          <AlertDescription>{member.email}</AlertDescription>
        </Alert>
        <Link
          className={buttonVariants({ className: 'mt-5 w-full' })}
          to='/login'
        >
          {translate('hub.auth.invitation.success.signIn', 'Sign in')}
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title={title} description={description}>
      <InvitationSummary invitation={invitation} />
      <form
        className='mt-6 space-y-4'
        onSubmit={(event) => {
          event.preventDefault();
          setSubmitting(true);
          setSubmitError(null);
          void hubPost<HubAcceptedInvitationMember>(
            '/invitation-acceptance/accept',
            { token, name, username, password },
            fetcher,
          )
            .then((result) => setMember(result.data))
            .catch((reason: unknown) => {
              setSubmitError(
                reason instanceof Error ? reason : new Error(String(reason)),
              );
            })
            .finally(() => setSubmitting(false));
        }}
      >
        {submitError ? (
          <Alert variant='destructive'>
            <AlertCircle aria-hidden='true' />
            <AlertTitle>
              {translate(
                'hub.auth.invitation.acceptError',
                'Unable to accept the invitation',
              )}
            </AlertTitle>
            <AlertDescription>{submitError.message}</AlertDescription>
          </Alert>
        ) : null}
        <div className='space-y-2'>
          <Label htmlFor='hub-invitation-name'>
            {translate('hub.auth.invitation.name', 'Name')}
          </Label>
          <Input
            id='hub-invitation-name'
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoComplete='name'
            autoFocus
            required
          />
        </div>
        <div className='space-y-2'>
          <Label htmlFor='hub-invitation-username'>
            {translate('hub.auth.invitation.username', 'Username')}
          </Label>
          <Input
            id='hub-invitation-username'
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete='username'
            minLength={3}
            maxLength={30}
            pattern='[A-Za-z0-9_.]+'
            required
          />
        </div>
        <div className='space-y-2'>
          <Label htmlFor='hub-invitation-password'>
            {translate('hub.auth.invitation.password', 'Password')}
          </Label>
          <InputPassword
            id='hub-invitation-password'
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete='new-password'
            minLength={8}
            maxLength={128}
            required
          />
        </div>
        <Button className='w-full' type='submit' disabled={submitting}>
          {submitting
            ? translate(
                'hub.auth.invitation.accepting',
                'Accepting invitation…',
              )
            : translate('hub.auth.invitation.accept', 'Accept invitation')}
        </Button>
      </form>
    </AuthLayout>
  );
}

export function HubAgentAuthorizationPage({
  fetcher,
}: {
  fetcher?: HubFetcher;
}) {
  const translate = useTranslate();
  const location = useLocation();
  const userCode = readFragmentValue(location.hash, 'code');
  const [authorization, setAuthorization] =
    useState<HubAgentAuthorization | null>(null);
  const [decision, setDecision] = useState<'approved' | 'denied' | null>(null);
  const [loading, setLoading] = useState(Boolean(userCode));
  const [submitting, setSubmitting] = useState<'approve' | 'deny' | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [decisionError, setDecisionError] = useState<Error | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (!userCode) {
      setLoading(false);
      setError(
        new Error(
          translate(
            'hub.auth.agent.missingCode',
            'This Agent authorization link is incomplete.',
          ),
        ),
      );
      return () => {
        cancelled = true;
      };
    }
    setLoading(true);
    setError(null);
    void hubPost<HubAgentAuthorization>(
      '/agent-authorizations/resolve',
      { userCode },
      fetcher,
    )
      .then((result) => {
        if (!cancelled) setAuthorization(result.data);
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(
            reason instanceof Error ? reason : new Error(String(reason)),
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fetcher, revision, translate, userCode]);

  const title = translate(
    'hub.auth.agent.title',
    'Authorize local Coding Agent',
  );
  const description = translate(
    'hub.auth.agent.description',
    'Review what this local Agent can do in Hub.',
  );

  if (loading) {
    return (
      <AuthLayout title={title} description={description}>
        <HubLoadingState
          label={translate(
            'hub.auth.agent.resolving',
            'Checking authorization request',
          )}
        />
      </AuthLayout>
    );
  }

  if (error || !authorization) {
    return (
      <AuthLayout title={title} description={description}>
        <HubErrorState
          error={error}
          title={translate(
            'hub.auth.agent.resolveError',
            'Unable to use this authorization request',
          )}
          onRetry={
            userCode ? () => setRevision((value) => value + 1) : undefined
          }
        />
      </AuthLayout>
    );
  }

  if (decision) {
    const approved = decision === 'approved';
    return (
      <AuthLayout
        title={
          approved
            ? translate('hub.auth.agent.approved.title', 'Agent authorized')
            : translate('hub.auth.agent.denied.title', 'Authorization denied')
        }
        description={
          approved
            ? translate(
                'hub.auth.agent.approved.description',
                'Return to your Coding Agent. It can now continue automatically.',
              )
            : translate(
                'hub.auth.agent.denied.description',
                'The Coding Agent was not granted access.',
              )
        }
      >
        <Alert>
          {approved ? (
            <CheckCircle2 aria-hidden='true' />
          ) : (
            <ShieldCheck aria-hidden='true' />
          )}
          <AlertTitle>{authorization.clientName}</AlertTitle>
          <AlertDescription>
            {translate(
              'hub.auth.agent.closeWindow',
              'You can close this window.',
            )}
          </AlertDescription>
        </Alert>
      </AuthLayout>
    );
  }

  const decide = (action: 'approve' | 'deny'): void => {
    setSubmitting(action);
    setDecisionError(null);
    const path = `/agent-authorizations/${encodeURIComponent(authorization.id)}/${action}`;
    const body =
      action === 'approve'
        ? {
            scopes: authorization.requestedScopes,
            applicationScope: authorization.requestedApplicationScope,
          }
        : {};
    void hubPost<HubAgentAuthorizationDecision>(path, body, fetcher)
      .then((result) => {
        setDecision(result.data.status === 'denied' ? 'denied' : 'approved');
      })
      .catch((reason: unknown) => {
        setDecisionError(
          reason instanceof Error ? reason : new Error(String(reason)),
        );
      })
      .finally(() => setSubmitting(null));
  };

  return (
    <AuthLayout title={title} description={description}>
      {decisionError ? (
        <Alert className='mb-4' variant='destructive'>
          <AlertCircle aria-hidden='true' />
          <AlertTitle>
            {translate(
              'hub.auth.agent.decisionError',
              'Unable to save your decision',
            )}
          </AlertTitle>
          <AlertDescription>{decisionError.message}</AlertDescription>
        </Alert>
      ) : null}
      <div className='space-y-4 rounded-xl border bg-muted/30 p-4'>
        <div>
          <div className='text-xs font-medium text-muted-foreground'>
            {translate('hub.auth.agent.client', 'Coding Agent')}
          </div>
          <div className='mt-1 font-medium'>{authorization.clientName}</div>
        </div>
        <div>
          <div className='text-xs font-medium text-muted-foreground'>
            {translate('hub.auth.agent.permissions', 'Requested permissions')}
          </div>
          <div className='mt-2 flex flex-wrap gap-1.5'>
            {authorization.requestedScopes.map((scope) => (
              <Badge key={scope} variant='secondary'>
                {scope}
              </Badge>
            ))}
          </div>
        </div>
        <div>
          <div className='text-xs font-medium text-muted-foreground'>
            {translate('hub.auth.agent.applicationScope', 'Application scope')}
          </div>
          <div className='mt-1 text-sm'>
            {authorization.requestedApplicationScope.mode === 'all-authorized'
              ? translate(
                  'hub.auth.agent.allAuthorized',
                  'All applications you can access, including future applications',
                )
              : translate(
                  'hub.auth.agent.selectedApplications',
                  {
                    count:
                      authorization.requestedApplicationScope.applicationIds
                        ?.length ?? 0,
                  },
                  '{{count}} selected applications',
                )}
          </div>
        </div>
        <div className='text-xs text-muted-foreground'>
          {translate('hub.auth.agent.expires', 'Request expires')} ·{' '}
          {formatHubDate(authorization.expiresAt)}
        </div>
      </div>
      <div className='mt-5 grid grid-cols-2 gap-3'>
        <Button
          type='button'
          variant='outline'
          disabled={submitting !== null}
          onClick={() => decide('deny')}
        >
          {submitting === 'deny'
            ? translate('hub.auth.agent.denying', 'Denying…')
            : translate('hub.auth.agent.deny', 'Deny')}
        </Button>
        <Button
          type='button'
          disabled={submitting !== null}
          onClick={() => decide('approve')}
        >
          {submitting === 'approve'
            ? translate('hub.auth.agent.approving', 'Authorizing…')
            : translate('hub.auth.agent.approve', 'Authorize Agent')}
        </Button>
      </div>
    </AuthLayout>
  );
}

function InvitationSummary({
  invitation,
}: {
  invitation: HubResolvedInvitation;
}) {
  const translate = useTranslate();
  return (
    <div className='space-y-3 rounded-xl border bg-muted/30 p-4'>
      <div>
        <div className='text-xs font-medium text-muted-foreground'>
          {translate('hub.auth.invitation.invitedEmail', 'Invited email')}
        </div>
        <div className='mt-1 font-medium'>{invitation.email}</div>
      </div>
      {invitation.access.globalRoles.length > 0 ? (
        <div>
          <div className='text-xs font-medium text-muted-foreground'>
            {translate('hub.auth.invitation.hubRoles', 'Hub roles')}
          </div>
          <div className='mt-2 flex flex-wrap gap-1.5'>
            {invitation.access.globalRoles.map((role) => (
              <Badge key={role.id} variant='secondary'>
                {role.name}
              </Badge>
            ))}
          </div>
        </div>
      ) : null}
      {invitation.access.applications.map((application) => (
        <div
          key={application.name}
          className='flex items-start justify-between gap-3'
        >
          <span className='font-medium'>{application.name}</span>
          <span className='flex flex-wrap justify-end gap-1.5'>
            {application.roles.map((role) => (
              <Badge key={role.id} variant='outline'>
                {role.name}
              </Badge>
            ))}
          </span>
        </div>
      ))}
      <div className='text-xs text-muted-foreground'>
        {translate('hub.auth.invitation.expires', 'Expires')} ·{' '}
        {formatHubDate(invitation.expiresAt)}
      </div>
    </div>
  );
}

function readLoginRedirect(state: unknown): string {
  if (!state || typeof state !== 'object') return '/';
  const from = (state as { from?: unknown }).from;
  if (!from || typeof from !== 'object') return '/';
  const location = from as {
    pathname?: unknown;
    search?: unknown;
    hash?: unknown;
  };
  if (
    typeof location.pathname !== 'string' ||
    !location.pathname.startsWith('/') ||
    location.pathname.startsWith('//') ||
    location.pathname === '/login' ||
    location.pathname === '/setup'
  ) {
    return '/';
  }
  const search =
    typeof location.search === 'string' && location.search.startsWith('?')
      ? location.search
      : '';
  const hash =
    typeof location.hash === 'string' && location.hash.startsWith('#')
      ? location.hash
      : '';
  return `${location.pathname}${search}${hash}`;
}

function readOwnerCreated(state: unknown): boolean {
  return Boolean(
    state &&
    typeof state === 'object' &&
    (state as { ownerCreated?: unknown }).ownerCreated === true,
  );
}

function readInvitationToken(hash: string): string | null {
  return readFragmentValue(hash, 'token');
}

function readFragmentValue(hash: string, key: string): string | null {
  const value = new URLSearchParams(hash.replace(/^#/, '')).get(key);
  return value?.trim() || null;
}

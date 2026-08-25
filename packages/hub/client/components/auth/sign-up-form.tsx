'use client';

import { AlertCircle, KeyRound } from 'lucide-react';
import { useState } from 'react';
import {
  useLink,
  useNotification,
  useRegister,
  useTranslate,
} from '@refinedev/core';
import {
  usePublicAuthenticators,
  type Authenticator,
  type AuthenticatorSignUpField,
} from '@nocobase/app-portal-sdk/auth';
import { useSearchParams } from 'react-router';

import { AuthLayout } from '@/components/auth/auth-layout';
import { InputPassword } from '@/components/auth/input-password';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { resolveTranslatableText } from '@nocobase/app-portal-sdk/i18n';

type SignUpFieldValue = string | number | boolean;
type SignUpValues = Record<string, SignUpFieldValue>;

type SignUpVariables = SignUpValues & {
  authenticator: string;
  password: string;
  confirm_password: string;
};

function getFieldLabel(field: AuthenticatorSignUpField) {
  return (
    resolveTranslatableText(field.uiSchema?.title, {
      ns: 'lm-collections',
    }) || field.field
  );
}

function getFieldId(authenticatorName: string, fieldName: string) {
  return `${authenticatorName}-${fieldName}`.replace(/[^a-zA-Z0-9_-]/g, '-');
}

function DynamicSignUpField({
  authenticatorName,
  field,
  value,
  onChange,
}: {
  authenticatorName: string;
  field: AuthenticatorSignUpField;
  value: SignUpFieldValue | undefined;
  onChange: (value: SignUpFieldValue) => void;
}) {
  const id = getFieldId(authenticatorName, field.field);
  const label = getFieldLabel(field);
  const component = field.uiSchema?.['x-component'];
  const options = field.uiSchema?.enum;

  if (options?.length) {
    const selectedValue =
      typeof value === 'undefined' ? undefined : String(value);

    return (
      <div className='space-y-2'>
        <Label htmlFor={id}>{label}</Label>
        <Select
          value={selectedValue}
          onValueChange={(nextValue) => {
            if (nextValue === null) return;
            const option = options.find(
              (item) => String(item.value) === nextValue,
            );
            onChange(option?.value ?? nextValue);
          }}
        >
          <SelectTrigger
            id={id}
            className='w-full'
            aria-required={field.required}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem
                key={`${typeof option.value}:${String(option.value)}`}
                value={String(option.value)}
              >
                {resolveTranslatableText(option.label) || String(option.value)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  if (component === 'Checkbox') {
    return (
      <div className='flex items-center gap-2'>
        <Checkbox
          id={id}
          name={field.field}
          checked={value === true}
          onCheckedChange={(checked) => onChange(checked)}
          aria-required={field.required}
        />
        <Label htmlFor={id}>{label}</Label>
      </div>
    );
  }

  if (component === 'Input.TextArea' || component === 'TextArea') {
    return (
      <div className='space-y-2'>
        <Label htmlFor={id}>{label}</Label>
        <Textarea
          id={id}
          name={field.field}
          value={typeof value === 'string' ? value : ''}
          onChange={(event) => onChange(event.target.value)}
          required={field.required}
          rows={4}
        />
      </div>
    );
  }

  return (
    <div className='space-y-2'>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={field.field}
        type={field.field === 'email' ? 'email' : 'text'}
        value={typeof value === 'string' ? value : ''}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={
          field.field === 'email'
            ? 'email'
            : field.field === 'username'
              ? 'username'
              : undefined
        }
        required={field.required}
      />
    </div>
  );
}

function BasicSignUpForm({ authenticator }: { authenticator: Authenticator }) {
  const [values, setValues] = useState<SignUpValues>({});
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const { open } = useNotification();
  const Link = useLink();
  const translate = useTranslate();
  const { mutate: register, isPending } = useRegister<SignUpVariables>();
  const fields = (authenticator.options?.signupForm ?? []).filter(
    (field) =>
      field?.show &&
      field.field !== 'password' &&
      field.field !== 'confirm_password',
  );

  const updateValue = (field: string, value: SignUpFieldValue) => {
    setValues((current) => ({ ...current, [field]: value }));
  };

  const handleSignUp = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const missingField = fields.find(
      (field) => field.required && !values[field.field],
    );
    if (missingField) {
      open?.({
        type: 'error',
        message: translate(
          'auth.signUp.missingField',
          { field: getFieldLabel(missingField) },
          'Please enter {{field}}',
        ),
      });
      return;
    }

    if (password !== confirmPassword) {
      open?.({
        type: 'error',
        message: translate(
          'auth.signUp.passwordMismatch',
          "Passwords don't match",
        ),
        description: translate(
          'auth.signUp.passwordMismatchDescription',
          'Please make sure both password fields match.',
        ),
      });
      return;
    }

    register({
      ...values,
      password,
      confirm_password: confirmPassword,
      authenticator: authenticator.name,
    });
  };

  return (
    <form onSubmit={handleSignUp} className='space-y-5'>
      {fields.map((field) => (
        <DynamicSignUpField
          key={field.field}
          authenticatorName={authenticator.name}
          field={field}
          value={values[field.field]}
          onChange={(value) => updateValue(field.field, value)}
        />
      ))}

      <div className='space-y-2'>
        <Label htmlFor={`${authenticator.name}-password`}>
          {translate('auth.password', 'Password')}
        </Label>
        <InputPassword
          id={`${authenticator.name}-password`}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete='new-password'
          required
        />
      </div>

      <div className='space-y-2'>
        <Label htmlFor={`${authenticator.name}-confirm-password`}>
          {translate('auth.confirmPassword', 'Confirm password')}
        </Label>
        <InputPassword
          id={`${authenticator.name}-confirm-password`}
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          autoComplete='new-password'
          required
        />
      </div>

      <Button type='submit' className='w-full' disabled={isPending}>
        {isPending
          ? translate('auth.creatingAccount', 'Creating account…')
          : translate('auth.signUp', 'Sign up')}
      </Button>

      <p className='text-center text-sm text-muted-foreground'>
        {translate('auth.haveAccount', 'Have an account?')}{' '}
        <Link
          to='/login'
          className='font-semibold text-foreground underline underline-offset-4'
        >
          {translate('auth.signIn', 'Sign in')}
        </Link>
      </p>
    </form>
  );
}

export const SignUpForm = () => {
  const translate = useTranslate();
  const [searchParams] = useSearchParams();
  const {
    data: authenticators = [],
    error,
    isPending,
  } = usePublicAuthenticators();
  const authenticatorName = searchParams.get('name');
  const authenticator = authenticators.find(
    (item) => item.name === authenticatorName,
  );

  return (
    <AuthLayout
      title={translate('auth.createAccount', 'Create your account')}
      description={translate(
        'auth.createAccountDescription',
        'Create your NocoBase account.',
      )}
    >
      {isPending ? (
        <div className='flex min-h-64 items-center justify-center'>
          <Spinner className='size-6 text-muted-foreground' />
        </div>
      ) : error ? (
        <Alert variant='destructive'>
          <AlertCircle />
          <AlertTitle>
            {translate(
              'auth.signUp.loadError',
              'Unable to load the sign-up method',
            )}
          </AlertTitle>
          <AlertDescription>
            {translate(
              'auth.signIn.loadErrorDescription',
              'Please try again or contact your administrator.',
            )}
          </AlertDescription>
        </Alert>
      ) : !authenticator || authenticator.authType !== 'Email/Password' ? (
        <Empty className='min-h-64 border'>
          <EmptyHeader>
            <EmptyMedia variant='icon'>
              <KeyRound />
            </EmptyMedia>
            <EmptyTitle>
              {translate('auth.signUp.noMethod', 'No sign-up method available')}
            </EmptyTitle>
            <EmptyDescription>
              {translate(
                'auth.signUp.invalidMethodDescription',
                'This sign-up link is invalid or the authentication method does not support account registration.',
              )}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : authenticator.options?.allowSignUp !== true ? (
        <Empty className='min-h-64 border'>
          <EmptyHeader>
            <EmptyMedia variant='icon'>
              <KeyRound />
            </EmptyMedia>
            <EmptyTitle>
              {translate(
                'auth.signUp.disabled',
                'Account registration is disabled',
              )}
            </EmptyTitle>
            <EmptyDescription>
              {translate(
                'auth.signUp.disabledDescription',
                'Contact your administrator if you need an account.',
              )}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <BasicSignUpForm
          key={authenticator.name}
          authenticator={authenticator}
        />
      )}
    </AuthLayout>
  );
};

SignUpForm.displayName = 'SignUpForm';

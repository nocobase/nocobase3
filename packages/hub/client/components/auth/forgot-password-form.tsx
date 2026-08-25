'use client';

import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useForgotPassword, useLink, useTranslate } from '@refinedev/core';
import { useSearchParams } from 'react-router';

import { AuthLayout } from '@/components/auth/auth-layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export const ForgotPasswordForm = () => {
  const [email, setEmail] = useState('');
  const Link = useLink();
  const translate = useTranslate();
  const [searchParams] = useSearchParams();
  const { mutate: forgotPassword, isPending } = useForgotPassword();

  const handleForgotPassword = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    forgotPassword({
      email,
      authenticator: searchParams.get('name') ?? undefined,
    });
  };

  return (
    <AuthLayout
      title={translate('auth.forgot.title', 'Forgot password')}
      description={translate(
        'auth.forgot.description',
        'Enter your email to reset your password.',
      )}
      footer={
        <Link
          to='/login'
          className='inline-flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground'
        >
          <ArrowLeft className='size-4' />
          {translate('auth.forgot.back', 'Back to sign in')}
        </Link>
      }
    >
      <form onSubmit={handleForgotPassword} className='space-y-5'>
        <div className='space-y-2'>
          <Label htmlFor='email'>
            {translate('auth.forgot.email', 'Email')}
          </Label>
          <Input
            id='email'
            type='email'
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete='email'
            autoFocus
            required
          />
        </div>
        <Button type='submit' className='w-full' disabled={isPending}>
          {isPending
            ? translate('auth.forgot.sending', 'Sending…')
            : translate('auth.forgot.send', 'Send reset link')}
        </Button>
      </form>
    </AuthLayout>
  );
};

ForgotPasswordForm.displayName = 'ForgotPasswordForm';

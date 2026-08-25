import { useLogin } from '@refinedev/core';
import {
  useState,
  type FormEvent,
  type PropsWithChildren,
  type ReactElement,
} from 'react';

interface AppLoginLayoutProps extends PropsWithChildren {
  readonly description: string;
  readonly title: string;
}

function AppLoginLayout({
  children,
  description,
  title,
}: AppLoginLayoutProps): ReactElement {
  return (
    <main className='grid min-h-svh place-items-center bg-background px-6 py-10 text-foreground'>
      <section className='w-full max-w-sm rounded-xl border bg-card p-8 text-card-foreground shadow-sm'>
        <header className='mb-8'>
          <p className='mb-8 text-lg font-semibold'>NocoBase</p>
          <h1 className='text-2xl font-semibold tracking-tight'>{title}</h1>
          <p className='mt-2 text-sm text-muted-foreground'>{description}</p>
        </header>
        {children}
      </section>
    </main>
  );
}

export default function ServiceDeskLoginPage(): ReactElement {
  const [identifier, setIdentifier] = useState('nocobase');
  const [password, setPassword] = useState('admin123');
  const { data, error, isPending, mutate } = useLogin<{
    identifier: string;
    password: string;
  }>();
  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    mutate({ identifier, password });
  };
  return (
    <AppLoginLayout
      description='登录后进入客户服务工作区，应用设置在独立设置中心管理。'
      title='登录客户服务中心'
    >
      <form className='space-y-5' onSubmit={submit}>
        <label className='block space-y-2 text-sm font-medium'>
          账号
          <input
            autoComplete='username'
            autoFocus
            className='h-10 w-full rounded-lg border border-input bg-background px-3 font-normal outline-none focus:ring-2 focus:ring-ring/30'
            onChange={(event) => setIdentifier(event.target.value)}
            value={identifier}
          />
        </label>
        <label className='block space-y-2 text-sm font-medium'>
          密码
          <input
            autoComplete='current-password'
            className='h-10 w-full rounded-lg border border-input bg-background px-3 font-normal outline-none focus:ring-2 focus:ring-ring/30'
            onChange={(event) => setPassword(event.target.value)}
            type='password'
            value={password}
          />
        </label>
        {(data?.error?.message ?? error?.message) ? (
          <p className='rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive'>
            {data?.error?.message ?? error?.message}
          </p>
        ) : null}
        <button
          className='h-10 w-full rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60'
          disabled={isPending}
          type='submit'
        >
          {isPending ? '正在登录…' : '登录'}
        </button>
        <p className='text-center text-xs text-muted-foreground'>
          本地预览账号：nocobase / admin123
        </p>
      </form>
    </AppLoginLayout>
  );
}

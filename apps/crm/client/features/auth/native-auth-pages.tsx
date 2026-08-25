import {
  useLink,
  useLogin,
  useNotification,
  useRegister,
} from '@refinedev/core';
import { ArrowLeft, BarChart3, ShieldCheck, Sparkles } from 'lucide-react';
import { useState, type PropsWithChildren, type ReactNode } from 'react';

import { Brand } from '@/components/app-shell/brand';
import { InputPassword } from '@/components/auth/input-password';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type LoginVariables = { identifier: string; password: string };
type RegisterVariables = {
  name: string;
  username: string;
  email: string;
  password: string;
};

function CrmAuthLayout({
  title,
  description,
  footer,
  children,
}: PropsWithChildren<{
  title: string;
  description: string;
  footer?: ReactNode;
}>) {
  return (
    <div className='grid min-h-svh bg-background lg:grid-cols-[minmax(420px,42%)_1fr]'>
      <main className='grid place-items-center bg-card px-6 py-10 sm:px-12'>
        <div className='w-full max-w-sm'>
          <Brand className='mb-12' logoClassName='h-10' />
          <p className='mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-primary'>
            NocoBase 3 · CRM
          </p>
          <h1 className='text-3xl font-semibold tracking-tight'>{title}</h1>
          <p className='mb-8 mt-2 text-sm leading-6 text-muted-foreground'>
            {description}
          </p>
          {children}
          {footer ? <div className='mt-7 text-sm'>{footer}</div> : null}
        </div>
      </main>
      <section className='relative hidden overflow-hidden bg-slate-950 p-12 text-white lg:grid lg:place-items-center'>
        <div className='absolute inset-0 opacity-10 [background-image:linear-gradient(currentColor_1px,transparent_1px),linear-gradient(90deg,currentColor_1px,transparent_1px)] [background-size:48px_48px]' />
        <div className='relative max-w-xl'>
          <p className='text-sm font-medium text-emerald-300'>销售工作台</p>
          <h2 className='mt-4 text-5xl font-semibold leading-tight tracking-[-0.04em]'>
            从线索到成交，所有进展都在一个地方。
          </h2>
          <p className='mt-5 max-w-lg text-base leading-7 text-white/65'>
            管理客户、联系人、商机和跟进计划，通过实时销售总览聚焦今天最重要的动作。
          </p>
          <div className='mt-10 grid gap-3 sm:grid-cols-3'>
            {[
              [Sparkles, '线索推进'],
              [BarChart3, '销售预测'],
              [ShieldCheck, '独立数据'],
            ].map(([Icon, label]) => {
              const FeatureIcon = Icon as typeof Sparkles;
              return (
                <div
                  key={String(label)}
                  className='rounded-xl border border-white/15 bg-white/5 p-4'
                >
                  <FeatureIcon className='size-5 text-emerald-300' />
                  <p className='mt-3 text-sm font-medium'>{String(label)}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}

export function CrmLoginPage() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const { mutate: login, isPending } = useLogin<LoginVariables>();
  const Link = useLink();

  return (
    <CrmAuthLayout
      title='登录 CRM'
      description='使用用户名或邮箱进入销售工作台。首次运行可先创建管理员账号。'
      footer={
        <span className='text-muted-foreground'>
          首次使用？{' '}
          <Link
            to='/register'
            className='font-semibold text-foreground hover:underline'
          >
            创建管理员账号
          </Link>
        </span>
      }
    >
      <form
        className='space-y-5'
        onSubmit={(event) => {
          event.preventDefault();
          login({ identifier, password });
        }}
      >
        <div className='space-y-2'>
          <Label htmlFor='identifier'>用户名或邮箱</Label>
          <Input
            id='identifier'
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
            autoComplete='username'
            autoFocus
            required
          />
        </div>
        <div className='space-y-2'>
          <Label htmlFor='password'>密码</Label>
          <InputPassword
            id='password'
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete='current-password'
            required
          />
        </div>
        <Button type='submit' className='w-full' disabled={isPending}>
          {isPending ? '正在登录…' : '登录'}
        </Button>
      </form>
    </CrmAuthLayout>
  );
}

export function CrmRegisterPage() {
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const { mutate: register, isPending } = useRegister<RegisterVariables>();
  const { open } = useNotification();
  const Link = useLink();

  return (
    <CrmAuthLayout
      title='初始化 CRM'
      description='创建第一个管理员账号。初始化完成后，默认关闭公开注册。'
      footer={
        <Link
          to='/login'
          className='inline-flex items-center gap-2 text-muted-foreground hover:text-foreground'
        >
          <ArrowLeft className='size-4' /> 返回登录
        </Link>
      }
    >
      <form
        className='space-y-4'
        onSubmit={(event) => {
          event.preventDefault();
          if (password !== confirmation) {
            open?.({ type: 'error', message: '两次输入的密码不一致' });
            return;
          }
          register({ name, username, email, password });
        }}
      >
        <div className='space-y-2'>
          <Label htmlFor='register-name'>姓名</Label>
          <Input
            id='register-name'
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
        </div>
        <div className='space-y-2'>
          <Label htmlFor='register-username'>用户名</Label>
          <Input
            id='register-username'
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete='username'
            required
          />
        </div>
        <div className='space-y-2'>
          <Label htmlFor='register-email'>邮箱</Label>
          <Input
            id='register-email'
            type='email'
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete='email'
            required
          />
        </div>
        <div className='grid gap-4 sm:grid-cols-2'>
          <div className='space-y-2'>
            <Label htmlFor='register-password'>密码</Label>
            <InputPassword
              id='register-password'
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete='new-password'
              required
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='register-confirmation'>确认密码</Label>
            <InputPassword
              id='register-confirmation'
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              autoComplete='new-password'
              required
            />
          </div>
        </div>
        <Button type='submit' className='w-full' disabled={isPending}>
          {isPending ? '正在创建…' : '创建管理员账号'}
        </Button>
      </form>
    </CrmAuthLayout>
  );
}

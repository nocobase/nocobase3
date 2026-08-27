import { createManagedApp } from '@nocobase/hub-release-management/client';
import { LoaderCircle, Terminal } from 'lucide-react';
import { useRef, useState } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DevelopmentGuideSteps } from './development-guide-dialog';
import { rememberDeployToken } from './deploy-token';

interface CreatedAppGuide {
  appId: string;
  deployToken: string;
}

interface CreateAppDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void | Promise<void>;
}

interface FormErrors {
  appId?: string;
  name?: string;
}

export function CreateAppDialog({
  open,
  onOpenChange,
  onCreated,
}: CreateAppDialogProps) {
  const requestGeneration = useRef(0);
  const [name, setName] = useState('');
  const [appId, setAppId] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [requestError, setRequestError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<CreatedAppGuide | null>(null);

  const reset = () => {
    requestGeneration.current += 1;
    setName('');
    setAppId('');
    setErrors({});
    setRequestError(null);
    setSubmitting(false);
    setCreated(null);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && (submitting || created)) return;
    if (!nextOpen) reset();
    onOpenChange(nextOpen);
  };

  const complete = () => {
    reset();
    onOpenChange(false);
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedName = name.trim();
    const normalizedAppId = appId.trim();
    const nextErrors = validateApp(normalizedName, normalizedAppId);
    setErrors(nextErrors);
    setRequestError(null);
    if (Object.keys(nextErrors).length > 0) return;

    const generation = requestGeneration.current;
    setSubmitting(true);
    try {
      const result = await createManagedApp({
        appId: normalizedAppId,
        name: normalizedName,
      });
      if (generation !== requestGeneration.current) return;
      rememberDeployToken(normalizedAppId, result.deployToken);
      setCreated({ appId: normalizedAppId, deployToken: result.deployToken });
      void onCreated();
    } catch (error) {
      if (generation !== requestGeneration.current) return;
      setRequestError(presentCreateError(error));
    } finally {
      if (generation === requestGeneration.current) setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className='max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl'
        showCloseButton={!submitting && !created}
      >
        {created ? (
          <CreationGuide
            appId={created.appId}
            deployToken={created.deployToken}
            onDone={complete}
          />
        ) : (
          <form className='contents' onSubmit={submit} noValidate>
            <DialogHeader>
              <DialogTitle>创建空应用</DialogTitle>
              <DialogDescription>
                先在 Hub 中预留 App ID，再按照创建后的指引在本地开发并部署。
              </DialogDescription>
            </DialogHeader>

            <div className='space-y-5 py-1'>
              <div className='space-y-2'>
                <Label htmlFor='create-app-name'>应用名称</Label>
                <Input
                  id='create-app-name'
                  name='name'
                  value={name}
                  maxLength={80}
                  autoComplete='off'
                  aria-invalid={Boolean(errors.name)}
                  aria-describedby={
                    errors.name ? 'create-app-name-error' : undefined
                  }
                  placeholder='例如：客户管理'
                  onChange={(event) => {
                    setName(event.target.value);
                    setErrors((current) => ({ ...current, name: undefined }));
                  }}
                />
                {errors.name ? (
                  <p
                    id='create-app-name-error'
                    className='text-xs text-destructive'
                  >
                    {errors.name}
                  </p>
                ) : null}
              </div>

              <div className='space-y-2'>
                <Label htmlFor='create-app-id'>App ID</Label>
                <Input
                  id='create-app-id'
                  name='appId'
                  value={appId}
                  maxLength={128}
                  autoCapitalize='none'
                  autoComplete='off'
                  spellCheck={false}
                  aria-invalid={Boolean(errors.appId)}
                  aria-describedby={
                    errors.appId
                      ? 'create-app-id-hint create-app-id-error'
                      : 'create-app-id-hint'
                  }
                  placeholder='例如：crm'
                  onChange={(event) => {
                    setAppId(event.target.value);
                    setErrors((current) => ({ ...current, appId: undefined }));
                  }}
                />
                <p
                  id='create-app-id-hint'
                  className='text-xs leading-5 text-muted-foreground'
                >
                  用于本地目录、发布身份和访问路径，创建后不可更改。
                </p>
                {errors.appId ? (
                  <p
                    id='create-app-id-error'
                    className='text-xs text-destructive'
                  >
                    {errors.appId}
                  </p>
                ) : null}
              </div>

              {requestError ? (
                <Alert variant='destructive'>
                  <AlertTitle>无法创建应用</AlertTitle>
                  <AlertDescription>{requestError}</AlertDescription>
                </Alert>
              ) : null}
            </div>

            <DialogFooter>
              <Button
                type='button'
                variant='outline'
                disabled={submitting}
                onClick={() => handleOpenChange(false)}
              >
                取消
              </Button>
              <Button type='submit' disabled={submitting}>
                {submitting ? <LoaderCircle className='animate-spin' /> : null}
                创建空应用
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CreationGuide({
  appId,
  deployToken,
  onDone,
}: CreatedAppGuide & { onDone: () => void }) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>应用创建成功</DialogTitle>
        <DialogDescription>
          App ID：<span className='font-mono text-foreground'>{appId}</span>
        </DialogDescription>
      </DialogHeader>

      <Alert>
        <Terminal />
        <AlertTitle>接下来请在本地开发</AlertTitle>
        <AlertDescription>
          Hub 只预留了 App
          ID，没有在你的电脑上创建目录。请在本地终端执行下面的命令。
        </AlertDescription>
      </Alert>

      <DevelopmentGuideSteps appId={appId} deployToken={deployToken} />

      <DialogFooter>
        <Button type='button' onClick={onDone}>
          完成
        </Button>
      </DialogFooter>
    </>
  );
}

function validateApp(name: string, appId: string): FormErrors {
  const errors: FormErrors = {};
  if (!name) {
    errors.name = '请输入应用名称。';
  } else if (name.length > 80 || containsControlCharacter(name)) {
    errors.name = '应用名称最多 80 个字符，且不能包含控制字符。';
  }
  if (!appId) {
    errors.appId = '请输入 App ID。';
  } else if (
    ['__apps', '__health', 'api', 'assets', 'healthz', 'hub'].includes(
      appId.toLowerCase(),
    )
  ) {
    errors.appId = `App ID “${appId}” 已由平台保留。`;
  } else if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(appId)) {
    errors.appId =
      'App ID 只能包含字母、数字、下划线和短横线，并且必须以字母或数字开头。';
  }
  return errors;
}

function containsControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  });
}

function presentCreateError(error: unknown): string {
  const status = readErrorStatus(error);
  if (status === 409) return '这个 App ID 已存在，请换一个。';
  if (status === 403) return '当前账号没有创建应用的权限。';
  if (
    status !== undefined &&
    status >= 400 &&
    status < 500 &&
    error instanceof Error &&
    error.message
  ) {
    return error.message;
  }
  return '创建请求失败，请稍后重试。';
}

function readErrorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object' || !('status' in error)) {
    return undefined;
  }
  return typeof error.status === 'number' ? error.status : undefined;
}

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Database,
  FlaskConical,
  Info,
} from 'lucide-react';
import { useLink } from '@refinedev/core';
import { toast } from 'sonner';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import {
  fetchStorageSettings,
  saveStorageSettings,
  testStorageSettings,
} from './api';
import {
  defaultStorageDraft,
  validateStorageDraft,
} from './storage-validation';
import type { StorageSettingsDraft, StorageSettingsResponse } from './types';

export interface StorageSettingsProps {
  appId?: string;
  appName?: string;
  backLabel?: string;
  backTo?: string;
}

export default function StorageSettings({
  appId,
  appName,
  backLabel = '返回',
  backTo = '/settings',
}: StorageSettingsProps) {
  const Link = useLink();
  const [draft, setDraft] = useState<StorageSettingsDraft>(defaultStorageDraft);
  const [persisted, setPersisted] = useState<StorageSettingsResponse | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(
    null,
  );
  const validation = useMemo(
    () =>
      validateStorageDraft(draft, {
        accessKeyIdConfigured: persisted?.accessKeyIdConfigured,
        secretAccessKeyConfigured: persisted?.secretConfigured,
      }),
    [draft, persisted],
  );

  useEffect(() => {
    const controller = new AbortController();
    void fetchStorageSettings(appId, controller.signal)
      .then((settings) => {
        if (!settings) return;
        setPersisted(settings);
        setDraft(toDraft(settings));
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setRequestError(
          error instanceof Error ? error.message : '无法读取配置',
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [appId]);

  const update = <K extends keyof StorageSettingsDraft>(
    key: K,
    value: StorageSettingsDraft[K],
  ) => {
    setTestResult(null);
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const testConnection = async () => {
    if (!validation.valid) {
      setTestResult('error');
      toast.error('请先补齐配置');
      return;
    }
    setTesting(true);
    try {
      const result = await testStorageSettings(draft, appId);
      setTestResult('success');
      setRequestError(null);
      toast.success('服务端安全校验通过', { description: result.message });
    } catch (error) {
      const message = error instanceof Error ? error.message : '配置测试失败';
      setTestResult('error');
      setRequestError(message);
      toast.error('配置测试失败', { description: message });
    } finally {
      setTesting(false);
    }
  };

  const saveDraft = async () => {
    if (!validation.valid) {
      toast.error('配置未保存', { description: '请先修正标红字段。' });
      return;
    }
    setSaving(true);
    try {
      const settings = await saveStorageSettings(draft, appId);
      setPersisted(settings);
      setDraft(toDraft(settings));
      setRequestError(null);
      toast.success('配置已写入服务端', {
        description: '敏感字段已加密保存，当前等待运行时应用接口接入。',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '配置保存失败';
      setRequestError(message);
      toast.error('配置保存失败', { description: message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className='space-y-6'>
      <div className='flex flex-wrap items-center justify-between gap-4'>
        <div>
          <Button
            variant='ghost'
            size='sm'
            className='mb-2 -ml-2'
            render={<Link to={backTo} />}
            nativeButton={false}
          >
            <ArrowLeft /> {backLabel}
          </Button>
          <div className='flex items-center gap-2'>
            <h1 className='font-heading text-3xl font-semibold tracking-tight'>
              文件存储
            </h1>
            <Badge>{appId ? 'App 运行资源' : '服务端持久化'}</Badge>
          </div>
          <p className='mt-2 text-sm text-muted-foreground'>
            为 {appName ?? '当前 App'} 绑定 Files / Drive
            使用的底层存储资源。配置按 App
            隔离写入服务端；文件分类、访问权限和业务用法仍在 App 内管理。
          </p>
        </div>
        <div className='flex gap-2'>
          <Button
            variant='outline'
            onClick={() => void testConnection()}
            disabled={loading || testing || saving}
          >
            <FlaskConical /> {testing ? '校验中...' : '服务端校验'}
          </Button>
          <Button
            onClick={() => void saveDraft()}
            disabled={loading || saving || !validation.valid}
          >
            <CheckCircle2 /> {saving ? '保存中...' : '保存配置'}
          </Button>
        </div>
      </div>

      <Alert>
        <Info />
        <AlertTitle>配置应用流程</AlertTitle>
        <AlertDescription>
          当前闭环是：读取 → 编辑 → 服务端校验 → 加密保存 →
          审计。当前保存和运行时应用是两个状态，页面不会把“已保存”当成“已生效”。
        </AlertDescription>
      </Alert>

      {requestError ? (
        <Alert variant='destructive'>
          <Info />
          <AlertTitle>配置服务请求失败</AlertTitle>
          <AlertDescription>{requestError}</AlertDescription>
        </Alert>
      ) : null}

      {testResult === 'success' ? (
        <Alert className='border-emerald-500/30 bg-emerald-500/5'>
          <CheckCircle2 className='text-emerald-600' />
          <AlertTitle>服务端安全校验通过</AlertTitle>
          <AlertDescription>
            服务端已检查字段和外部 Endpoint
            的安全边界；真正切换存储盘仍需要接入运行时应用接口。这不是对存储厂商发起的真实连通性测试。
          </AlertDescription>
        </Alert>
      ) : null}

      <div className='grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]'>
        <Card>
          <CardHeader className='border-b'>
            <div className='flex items-center gap-3'>
              <div className='grid size-10 place-items-center rounded-xl bg-primary/10 text-primary'>
                <Database className='size-5' />
              </div>
              <div>
                <CardTitle>存储盘配置</CardTitle>
                <CardDescription>
                  支持本地文件系统和 S3 兼容对象存储。
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className='space-y-6 pt-5'>
            <div className='grid gap-4 sm:grid-cols-2'>
              <Field
                label='存储名称'
                required
                error={validation.errors.name}
                description='用于在 App 内识别这块存储盘。'
              >
                <Input
                  value={draft.name}
                  onChange={(event) => update('name', event.target.value)}
                />
              </Field>
              <Field
                label='驱动类型'
                required
                description='保存后切换驱动可能需要重启 App。'
              >
                <NativeSelect
                  value={draft.driver}
                  onChange={(event) =>
                    update(
                      'driver',
                      event.target.value as StorageSettingsDraft['driver'],
                    )
                  }
                >
                  <NativeSelectOption value='fs'>
                    本地文件系统（FS）
                  </NativeSelectOption>
                  <NativeSelectOption value='s3'>
                    S3 / OSS 兼容存储
                  </NativeSelectOption>
                </NativeSelect>
              </Field>
            </div>

            {draft.driver === 'fs' ? (
              <LocalStorageFields
                draft={draft}
                update={update}
                errors={validation.errors}
              />
            ) : (
              <S3StorageFields
                draft={draft}
                update={update}
                errors={validation.errors}
              />
            )}

            <Separator />
            <div className='grid gap-4 sm:grid-cols-2'>
              <Field
                label='访问策略'
                description='私有文件需要通过签名 URL 或受控接口访问。'
              >
                <NativeSelect
                  value={draft.visibility}
                  onChange={(event) =>
                    update(
                      'visibility',
                      event.target.value as StorageSettingsDraft['visibility'],
                    )
                  }
                >
                  <NativeSelectOption value='public'>公开</NativeSelectOption>
                  <NativeSelectOption value='private'>私有</NativeSelectOption>
                </NativeSelect>
              </Field>
              <Field
                label='公开访问地址'
                error={validation.errors.publicUrl}
                description='可填写站内绝对路径或 CDN 地址。'
              >
                <Input
                  value={draft.publicUrl}
                  onChange={(event) => update('publicUrl', event.target.value)}
                  placeholder='/storage/uploads'
                />
              </Field>
            </div>
            <div className='flex items-center justify-between rounded-xl border bg-muted/20 p-3'>
              <div>
                <Label htmlFor='default-storage'>设为默认存储</Label>
                <p className='mt-1 text-xs text-muted-foreground'>
                  新上传文件默认写入这块存储盘。
                </p>
              </div>
              <Switch
                id='default-storage'
                checked={draft.isDefault}
                onCheckedChange={(checked) => update('isDefault', checked)}
              />
            </div>
          </CardContent>
        </Card>

        <aside className='space-y-4'>
          <Card>
            <CardHeader>
              <CardTitle>当前状态</CardTitle>
              <CardDescription>服务端返回的真实状态</CardDescription>
            </CardHeader>
            <CardContent className='space-y-3 text-sm'>
              <StatusRow
                label='字段校验'
                value={validation.valid ? '通过' : '待修正'}
                ok={validation.valid}
              />
              <StatusRow
                label='服务端校验'
                value={testResult === 'success' ? '通过' : '未测试'}
                ok={testResult === 'success'}
              />
              <StatusRow
                label='服务端保存'
                value={persisted ? '已保存' : loading ? '读取中' : '未配置'}
                ok={Boolean(persisted)}
              />
              <StatusRow
                label='运行时应用'
                value={persisted ? '等待运行时接入' : '未应用'}
                ok={false}
              />
              <Separator />
              <p className='text-xs leading-5 text-muted-foreground'>
                {persisted
                  ? `最后由 ${persisted.updatedBy.name} 于 ${formatTimestamp(persisted.updatedAt)} 保存。`
                  : '首次保存后会显示修改人、保存时间和应用状态。'}
              </p>
            </CardContent>
          </Card>
          <Card className='bg-muted/20'>
            <CardHeader>
              <CardTitle>当前边界</CardTitle>
            </CardHeader>
            <CardContent className='text-sm leading-6 text-muted-foreground'>
              <ul className='list-disc space-y-2 pl-4'>
                <li>配置已服务端持久化，并记录修改和测试审计。</li>
                <li>Secret Access Key 加密落盘，读取时只返回是否已配置。</li>
                <li>
                  当前使用单实例文件 Store；多实例部署需换成数据库 Store。
                </li>
                <li>运行时应用和配置版本回滚仍需下一步接入 App Host。</li>
              </ul>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function LocalStorageFields({
  draft,
  update,
  errors,
}: {
  draft: StorageSettingsDraft;
  update: <K extends keyof StorageSettingsDraft>(
    key: K,
    value: StorageSettingsDraft[K],
  ) => void;
  errors: ReturnType<typeof validateStorageDraft>['errors'];
}) {
  return (
    <div>
      <Field
        label='本地目录'
        required
        error={errors.localPath}
        description='相对于 App 数据目录的安全路径，不允许绝对路径或 ..。'
      >
        <Input
          value={draft.localPath}
          onChange={(event) => update('localPath', event.target.value)}
          placeholder='storage/uploads'
        />
      </Field>
    </div>
  );
}

function S3StorageFields({
  draft,
  update,
  errors,
}: {
  draft: StorageSettingsDraft;
  update: <K extends keyof StorageSettingsDraft>(
    key: K,
    value: StorageSettingsDraft[K],
  ) => void;
  errors: ReturnType<typeof validateStorageDraft>['errors'];
}) {
  return (
    <div className='space-y-4'>
      <div className='grid gap-4 sm:grid-cols-2'>
        <Field
          label='Endpoint'
          error={errors.endpoint}
          description='留空时使用云厂商默认地址。'
        >
          <Input
            value={draft.endpoint}
            onChange={(event) => update('endpoint', event.target.value)}
            placeholder='https://s3.example.com'
          />
        </Field>
        <Field label='Region' required error={errors.region}>
          <Input
            value={draft.region}
            onChange={(event) => update('region', event.target.value)}
            placeholder='cn-hangzhou'
          />
        </Field>
        <Field label='Bucket' required error={errors.bucket}>
          <Input
            value={draft.bucket}
            onChange={(event) => update('bucket', event.target.value)}
            placeholder='my-app-files'
          />
        </Field>
        <Field label='Access Key ID' required error={errors.accessKeyId}>
          <Input
            value={draft.accessKeyId}
            onChange={(event) => update('accessKeyId', event.target.value)}
            placeholder='留空则保留服务端现有凭证'
          />
        </Field>
        <Field
          label='Secret Access Key'
          required
          error={errors.secretAccessKey}
          description='仅用于本次编辑，真实版本需要服务端加密保存。'
        >
          <Input
            type='password'
            value={draft.secretAccessKey}
            onChange={(event) => update('secretAccessKey', event.target.value)}
            placeholder='留空则保留服务端现有凭证'
          />
        </Field>
      </div>
      <div className='grid gap-3 sm:grid-cols-2'>
        <ToggleField
          label='Force Path Style'
          checked={draft.forcePathStyle}
          onCheckedChange={(checked) => update('forcePathStyle', checked)}
        />
        <ToggleField
          label='支持 ACL'
          checked={draft.supportsAcl}
          onCheckedChange={(checked) => update('supportsAcl', checked)}
        />
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  description,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  description?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className='space-y-2'>
      <Label>
        {label} {required ? <span className='text-destructive'>*</span> : null}
      </Label>
      {children}
      {error ? (
        <p className='text-xs text-destructive'>{error}</p>
      ) : description ? (
        <p className='text-xs leading-5 text-muted-foreground'>{description}</p>
      ) : null}
    </div>
  );
}

function ToggleField({
  label,
  checked,
  onCheckedChange,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className='flex items-center justify-between rounded-xl border px-3 py-2.5'>
      <span className='text-sm'>{label}</span>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function StatusRow({
  label,
  value,
  ok,
}: {
  label: string;
  value: string;
  ok: boolean;
}) {
  return (
    <div className='flex items-center justify-between'>
      <span className='text-muted-foreground'>{label}</span>
      <span className={cn('font-medium', ok && 'text-emerald-600')}>
        {value}
      </span>
    </div>
  );
}

function toDraft(settings: StorageSettingsResponse): StorageSettingsDraft {
  return {
    name: settings.name,
    driver: settings.driver,
    visibility: settings.visibility,
    isDefault: settings.isDefault,
    localPath: settings.localPath,
    publicUrl: settings.publicUrl,
    endpoint: settings.endpoint,
    region: settings.region,
    bucket: settings.bucket,
    accessKeyId: '',
    secretAccessKey: '',
    forcePathStyle: settings.forcePathStyle,
    supportsAcl: settings.supportsAcl,
  };
}

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

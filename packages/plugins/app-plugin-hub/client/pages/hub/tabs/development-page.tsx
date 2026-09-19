import { Clipboard, ClipboardCheck } from 'lucide-react';
import { useEffect, useState, type ReactElement } from 'react';
import { Link, useLocation } from 'react-router';
import { useTranslation } from '@nocobase/i18n/client';
import { Button } from '../../../components/ui/button.js';
import { useHubAppPage } from '../app-page.js';

function CopyableText({
  text,
  label,
}: {
  readonly text: string;
  readonly label: string;
}): ReactElement {
  const { t } = useTranslation('@nocobase/app-plugin-hub');
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(timer);
  }, [copied]);
  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  };
  return (
    <div>
      <div className='flex items-center gap-3 rounded-lg bg-muted px-3 py-2'>
        <pre className='min-w-0 flex-1 whitespace-pre-wrap break-all font-mono text-sm leading-6'>
          <code>{text}</code>
        </pre>
        <Button
          aria-label={label}
          onClick={() => void copy()}
          className='shrink-0 self-start'
          size='icon'
          variant='outline'
        >
          {copied ? <ClipboardCheck /> : <Clipboard />}
        </Button>
      </div>
      <span
        role='status'
        className={failed ? 'text-sm text-destructive' : 'sr-only'}
      >
        {failed
          ? t('development.copyFailed', {
              defaultValue:
                'Could not copy. Select and copy the text manually.',
            })
          : copied
            ? t('development.copied', { defaultValue: 'Copied' })
            : ''}
      </span>
    </div>
  );
}

export default function DevelopmentPage(): ReactElement {
  const { app, capabilities } = useHubAppPage();
  const { t } = useTranslation('@nocobase/app-plugin-hub');
  const { search } = useLocation();
  const [existing, setExisting] = useState(false);
  return (
    <div className='mx-auto max-w-4xl py-2'>
      <h2 className='text-lg font-semibold'>
        {t('development.title', { defaultValue: 'Deploy your first release' })}
      </h2>
      <p className='mt-1 text-sm text-muted-foreground'>
        {t('development.description', {
          defaultValue:
            'Prepare your project locally, then upload and deploy it here.',
        })}
      </p>
      <div
        className='mt-4 inline-flex max-w-full flex-wrap gap-1 rounded-lg bg-muted p-1'
        role='group'
        aria-label={t('development.projectSource', {
          defaultValue: 'Project source',
        })}
      >
        <Button
          size='sm'
          variant={existing ? 'ghost' : 'outline'}
          aria-pressed={!existing}
          onClick={() => setExisting(false)}
        >
          {t('development.createTitle', {
            defaultValue: 'New project',
          })}
        </Button>
        <Button
          size='sm'
          variant={existing ? 'outline' : 'ghost'}
          aria-pressed={existing}
          onClick={() => setExisting(true)}
        >
          {t('development.existingTitle', {
            defaultValue: 'Existing project',
          })}
        </Button>
      </div>

      <ol className='mt-4 space-y-4'>
        {!existing && (
          <li className='flex gap-3 sm:gap-4'>
            <span
              aria-hidden='true'
              className='grid size-7 shrink-0 place-items-center rounded-full bg-muted text-sm font-medium'
            >
              1
            </span>
            <section className='min-w-0 flex-1 space-y-2'>
              <h3 className='pt-0.5 text-sm font-semibold'>
                {t('development.prepareTitle', {
                  defaultValue: 'Prepare your project',
                })}
              </h3>
              <div className='space-y-2'>
                <p className='text-sm text-muted-foreground'>
                  {t('development.createDescription', {
                    defaultValue:
                      'Run this command where you keep your source projects.',
                  })}
                </p>
                <CopyableText
                  text={`pnpm create @nocobase/app ${app.app.id}`}
                  label={t('development.copyCommand', {
                    defaultValue: 'Copy create-app command',
                  })}
                />
                <p className='text-sm text-muted-foreground'>
                  {t('development.agentDescription', {
                    defaultValue:
                      'Next, hand the project to your AI Agent and let it start building. To build a CRM application, for example, send it this:',
                  })}
                </p>
                <CopyableText
                  text={t('development.agentPrompt', {
                    defaultValue:
                      'Build a CRM application based on this NocoBase 3 project template.',
                  })}
                  label={t('development.copyPrompt', {
                    defaultValue: 'Copy example prompt',
                  })}
                />
                <p className='text-sm text-muted-foreground'>
                  {t('development.footer', {
                    defaultValue:
                      'Open the generated directory and finish local setup and development before building.',
                  })}
                </p>
              </div>
            </section>
          </li>
        )}
        <li className='flex gap-3 sm:gap-4'>
          <span
            aria-hidden='true'
            className='grid size-7 shrink-0 place-items-center rounded-full bg-muted text-sm font-medium'
          >
            {existing ? 1 : 2}
          </span>
          <section className='min-w-0 flex-1 space-y-2'>
            <h3 className='pt-0.5 text-sm font-semibold'>
              {t('development.buildTitle', {
                defaultValue: 'Build the release',
              })}
            </h3>
            <p className='text-sm text-muted-foreground'>
              {t('development.buildDescription', {
                defaultValue:
                  'Run in your project directory. The archive is saved to storage/dist.tar.gz.',
              })}
            </p>
            <CopyableText
              text='pnpm build --tar'
              label={t('development.copyBuild', {
                defaultValue: 'Copy build command',
              })}
            />
            <p className='text-sm text-muted-foreground'>
              {t('development.buildTarget', {
                defaultValue:
                  'Building for another machine? Match the Hub host with --target and --node-version. See pnpm build --help for options.',
              })}
            </p>
          </section>
        </li>
        <li className='flex gap-3 sm:gap-4'>
          <span
            aria-hidden='true'
            className='grid size-7 shrink-0 place-items-center rounded-full bg-muted text-sm font-medium'
          >
            {existing ? 2 : 3}
          </span>
          <section className='min-w-0 flex-1 space-y-2'>
            <h3 className='pt-0.5 text-sm font-semibold'>
              {t('development.publishTitle', {
                defaultValue: 'Upload, then deploy',
              })}
            </h3>
            <p className='text-sm text-muted-foreground'>
              {t('development.uploadDescription', {
                defaultValue:
                  'Upload storage/dist.tar.gz in Releases & deployments. Then choose Deploy on the release and review its configuration.',
              })}
            </p>
            <div className='flex flex-wrap items-center gap-3'>
              {(capabilities['read-release'] ||
                capabilities['read-deployment'] ||
                capabilities['upload-release']) && (
                <Button
                  render={<Link to={{ pathname: '../deployments', search }} />}
                >
                  {t('development.openWorkspace', {
                    defaultValue: 'Go to Releases & deployments',
                  })}
                </Button>
              )}
            </div>
            <p className='text-xs text-muted-foreground'>
              {t('development.deployDescription', {
                defaultValue:
                  'Uploading does not start the application. Visit it after deployment succeeds.',
              })}
            </p>
          </section>
        </li>
      </ol>
    </div>
  );
}

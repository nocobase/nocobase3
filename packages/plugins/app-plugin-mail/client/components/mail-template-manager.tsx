import { FileText, Plus, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { useTranslation } from '@nocobase/i18n/client';

import { MailRichTextEditor } from './mail-rich-text-editor.js';
import { Button } from './ui/button.js';
import { Card } from './ui/card.js';
import { Input } from './ui/input.js';
import { plainTextToMailHtml } from '../lib/mail-template.js';
import { mailErrorMessage, type MailTemplate } from '../mail-client.js';
import { useMailClient } from '../runtime.js';
import { MAIL_PLUGIN_NS } from '../namespace.js';
import { cn } from '../lib/utils.js';

interface TemplateDraft {
  readonly id?: string;
  readonly name: string;
  readonly subject: string;
  readonly text: string;
  readonly html: string;
}

const EMPTY_TEMPLATE: TemplateDraft = {
  name: '',
  subject: '',
  text: '',
  html: '',
};

export function MailTemplateManager(): ReactElement {
  const mail = useMailClient();
  const { t } = useTranslation(MAIL_PLUGIN_NS);
  const [templates, setTemplates] = useState<readonly MailTemplate[]>([]);
  const [draft, setDraft] = useState<TemplateDraft>(EMPTY_TEMPLATE);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const showError = useCallback(
    (cause: unknown): void =>
      setError(
        mailErrorMessage(
          cause,
          t('errors.requestFailed', { defaultValue: 'Mail request failed.' }),
        ),
      ),
    [t],
  );
  const refresh = useCallback((): void => {
    setLoading(true);
    setError(undefined);
    void mail
      .listTemplates()
      .then((nextTemplates) =>
        setTemplates([...nextTemplates].sort(compareTemplates)),
      )
      .catch(showError)
      .finally(() => setLoading(false));
  }, [mail, showError]);

  useEffect(() => {
    void Promise.resolve().then(refresh);
  }, [refresh]);

  const save = (): void => {
    if (!draft.name.trim() || !draft.subject.trim() || busy) return;
    setBusy(true);
    setError(undefined);
    void mail
      .saveTemplate(draft)
      .then(() => {
        setDraft(EMPTY_TEMPLATE);
        refresh();
      })
      .catch(showError)
      .finally(() => setBusy(false));
  };

  const remove = (templateId: string): void => {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    void mail
      .deleteTemplate(templateId)
      .then(() => {
        if (draft.id === templateId) setDraft(EMPTY_TEMPLATE);
        refresh();
      })
      .catch(showError)
      .finally(() => setBusy(false));
  };

  const selectTemplate = (template: MailTemplate): void => {
    setDraft({
      id: template.id,
      name: template.name,
      subject: template.subject,
      text: template.text ?? '',
      html: template.html || plainTextToMailHtml(template.text ?? ''),
    });
    setError(undefined);
  };

  const resetDraft = (): void => {
    setDraft(EMPTY_TEMPLATE);
    setError(undefined);
  };

  const selectedTemplateId = draft.id;

  return (
    <div className='grid min-h-0 w-full gap-4 lg:h-full lg:grid-cols-[18rem_minmax(0,1fr)]'>
      <Card className='flex min-h-0 flex-col overflow-hidden rounded-2xl bg-background shadow-sm'>
        <div className='flex shrink-0 items-center justify-between gap-3 border-b bg-muted/20 px-4 py-3'>
          <div className='flex min-w-0 items-center gap-2'>
            <span className='grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary'>
              <FileText aria-hidden='true' className='size-4' />
            </span>
            <span className='sr-only'>
              {t('templates.list', { defaultValue: 'Templates' })}
            </span>
          </div>
          <div className='flex items-center gap-2'>
            <span className='inline-flex h-7 min-w-7 shrink-0 items-center justify-center rounded-full border bg-background px-2 text-xs font-semibold'>
              {templates.length}
            </span>
            <Button
              className='h-8 shrink-0 px-3 text-xs'
              disabled={busy}
              onClick={resetDraft}
              type='button'
              variant='outline'
            >
              <Plus aria-hidden='true' className='size-3.5' />
              {t('templates.new', { defaultValue: 'New template' })}
            </Button>
          </div>
        </div>

        {error ? (
          <p className='border-b border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive'>
            {error}
          </p>
        ) : null}

        {loading ? (
          <p className='p-4 text-sm text-muted-foreground'>
            {t('templates.loading', { defaultValue: 'Loading templates…' })}
          </p>
        ) : templates.length === 0 ? (
          <div className='grid min-h-48 place-items-center p-4 text-center'>
            <div>
              <span className='mx-auto grid size-10 place-items-center rounded-full bg-muted text-muted-foreground'>
                <FileText aria-hidden='true' className='size-4' />
              </span>
              <p className='mt-3 text-sm font-medium'>
                {t('templates.empty', { defaultValue: 'No templates yet.' })}
              </p>
              <p className='mt-1 text-xs text-muted-foreground'>
                {t('templates.emptyHint', {
                  defaultValue: 'Create one to reuse it in the composer.',
                })}
              </p>
            </div>
          </div>
        ) : (
          <div
            aria-label={t('templates.list', { defaultValue: 'Templates' })}
            className='min-h-0 flex-1 divide-y overflow-y-auto overscroll-contain'
            role='region'
          >
            {templates.map((template) => (
              <button
                aria-current={draft.id === template.id ? 'true' : undefined}
                className={cn(
                  'flex w-full min-w-0 items-center gap-3 border-l-2 border-transparent px-4 py-2.5 text-left transition-colors hover:bg-muted/30',
                  draft.id === template.id &&
                    'border-primary bg-primary/10 hover:bg-primary/15',
                )}
                key={template.id}
                onClick={() => selectTemplate(template)}
                type='button'
              >
                <span className='grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground'>
                  <FileText aria-hidden='true' className='size-4' />
                </span>
                <span className='min-w-0 flex-1'>
                  <span className='block truncate font-medium'>
                    {template.name}
                  </span>
                  <span className='block truncate text-xs text-muted-foreground'>
                    {template.subject}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
      </Card>
      <Card className='min-h-0 space-y-5 overflow-y-auto p-5'>
        <div className='flex items-start justify-between gap-3'>
          <div>
            <p className='text-xs font-medium tracking-wide text-muted-foreground uppercase'>
              {t('templates.formEyebrow', {
                defaultValue: 'Template setup',
              })}
            </p>
            <h2 className='mt-1 font-semibold'>
              {t(draft.id ? 'templates.edit' : 'templates.new', {
                defaultValue: draft.id ? 'Edit template' : 'New template',
              })}
            </h2>
          </div>
          {draft.id ? (
            <Button
              aria-label={t('templates.cancel', { defaultValue: 'Cancel' })}
              className='size-8 p-0'
              onClick={resetDraft}
              type='button'
              variant='ghost'
            >
              <X aria-hidden='true' className='size-4' />
            </Button>
          ) : null}
        </div>

        <div className='space-y-2'>
          <label className='text-sm font-medium' htmlFor='mail-template-name'>
            {t('templates.name', { defaultValue: 'Template name' })}
          </label>
          <Input
            disabled={busy}
            id='mail-template-name'
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                name: event.target.value,
              }))
            }
            placeholder={t('templates.name', {
              defaultValue: 'Template name',
            })}
            value={draft.name}
          />
        </div>

        <div className='space-y-2'>
          <label
            className='text-sm font-medium'
            htmlFor='mail-template-subject'
          >
            {t('workspace.subject', { defaultValue: 'Subject' })}
          </label>
          <Input
            disabled={busy}
            id='mail-template-subject'
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                subject: event.target.value,
              }))
            }
            placeholder={t('workspace.subject', { defaultValue: 'Subject' })}
            value={draft.subject}
          />
        </div>

        <p className='text-xs text-muted-foreground'>
          {t('templates.variablesHelp', {
            defaultValue:
              'Use placeholders such as {{record.customer.name}}. Values are bound when the template is applied.',
          })}
        </p>
        <MailRichTextEditor
          ariaLabel={t('workspace.messageBodyLabel', {
            defaultValue: 'Message body',
          })}
          labels={{
            toolbar: t('workspace.editor.toolbar', {
              defaultValue: 'Formatting',
            }),
            bold: t('workspace.editor.bold', { defaultValue: 'Bold' }),
            italic: t('workspace.editor.italic', { defaultValue: 'Italic' }),
            underline: t('workspace.editor.underline', {
              defaultValue: 'Underline',
            }),
            bulletList: t('workspace.editor.bulletList', {
              defaultValue: 'Bulleted list',
            }),
            numberedList: t('workspace.editor.numberedList', {
              defaultValue: 'Numbered list',
            }),
            undo: t('workspace.editor.undo', { defaultValue: 'Undo' }),
            redo: t('workspace.editor.redo', { defaultValue: 'Redo' }),
            clearFormatting: t('workspace.editor.clearFormatting', {
              defaultValue: 'Clear formatting',
            }),
          }}
          onChange={(value) =>
            setDraft((current) => ({
              ...current,
              text: value.text,
              html: value.html,
            }))
          }
          placeholder={t('workspace.messageBody', {
            defaultValue: 'Write a message…',
          })}
          value={draft.html}
        />
        <div className='flex justify-end gap-2'>
          {selectedTemplateId ? (
            <Button
              disabled={busy}
              onClick={() => remove(selectedTemplateId)}
              type='button'
              variant='destructive'
            >
              <Trash2 aria-hidden='true' className='size-4' />
              {t('templates.delete', { defaultValue: 'Delete' })}
            </Button>
          ) : null}
          <Button
            disabled={busy || !draft.name.trim() || !draft.subject.trim()}
            onClick={save}
            type='button'
          >
            {busy
              ? t('templates.saving', { defaultValue: 'Saving…' })
              : t('templates.save', { defaultValue: 'Save template' })}
          </Button>
        </div>
      </Card>
    </div>
  );
}

function compareTemplates(left: MailTemplate, right: MailTemplate): number {
  return left.name.localeCompare(right.name);
}

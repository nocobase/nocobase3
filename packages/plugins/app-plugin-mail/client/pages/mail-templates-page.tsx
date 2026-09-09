import { Plus, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { useTranslation } from '@nocobase/i18n/client';

import { MailPageHeader, MailRichTextEditor } from '../components/index.js';
import { Button } from '../components/ui/button.js';
import { Card } from '../components/ui/card.js';
import { Input } from '../components/ui/input.js';
import { plainTextToMailHtml } from '../lib/mail-template.js';
import { mailErrorMessage, type MailTemplate } from '../mail-client.js';
import { getMailClient } from '../runtime.js';

const mail = getMailClient();

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

export default function MailTemplatesPage(): ReactElement {
  const { t } = useTranslation();
  const [templates, setTemplates] = useState<readonly MailTemplate[]>([]);
  const [draft, setDraft] = useState<TemplateDraft>(EMPTY_TEMPLATE);
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
    setError(undefined);
    void mail.listTemplates().then(setTemplates, showError);
  }, [showError]);

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
    void mail
      .deleteTemplate(templateId)
      .then(() => {
        if (draft.id === templateId) setDraft(EMPTY_TEMPLATE);
        refresh();
      })
      .catch(showError)
      .finally(() => setBusy(false));
  };

  return (
    <section className='min-h-[calc(100svh-4rem)] bg-muted/20'>
      <MailPageHeader
        description={t('templates.description', {
          defaultValue:
            'Create reusable subjects and message bodies for the composer.',
        })}
        eyebrow={t('settings.eyebrow', { defaultValue: 'Communication' })}
        title={t('templates.title', { defaultValue: 'Mail templates' })}
      />
      <div className='mx-auto grid w-full max-w-6xl gap-6 px-6 py-6 lg:grid-cols-[20rem_1fr]'>
        <Card className='h-fit p-4'>
          <Button className='w-full' onClick={() => setDraft(EMPTY_TEMPLATE)}>
            <Plus className='size-4' />
            {t('templates.new', { defaultValue: 'New template' })}
          </Button>
          <div className='mt-3 space-y-2'>
            {templates.map((template) => (
              <button
                className='w-full rounded-lg border p-3 text-left hover:bg-muted/40'
                key={template.id}
                onClick={() =>
                  setDraft({
                    id: template.id,
                    name: template.name,
                    subject: template.subject,
                    text: template.text ?? '',
                    html:
                      template.html || plainTextToMailHtml(template.text ?? ''),
                  })
                }
                type='button'
              >
                <span className='block font-medium'>{template.name}</span>
                <span className='block truncate text-xs text-muted-foreground'>
                  {template.subject}
                </span>
              </button>
            ))}
          </div>
        </Card>
        <Card className='space-y-4 p-6'>
          {error ? <p className='text-sm text-destructive'>{error}</p> : null}
          <Input
            aria-label={t('templates.name', {
              defaultValue: 'Template name',
            })}
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
          <Input
            aria-label={t('workspace.subject', { defaultValue: 'Subject' })}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                subject: event.target.value,
              }))
            }
            placeholder={t('workspace.subject', { defaultValue: 'Subject' })}
            value={draft.subject}
          />
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
              italic: t('workspace.editor.italic', {
                defaultValue: 'Italic',
              }),
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
            {draft.id ? (
              <Button
                disabled={busy}
                onClick={() => remove(draft.id!)}
                variant='destructive'
              >
                <Trash2 className='size-4' />
                {t('templates.delete', { defaultValue: 'Delete' })}
              </Button>
            ) : null}
            <Button
              disabled={busy || !draft.name.trim() || !draft.subject.trim()}
              onClick={save}
            >
              {t('templates.save', { defaultValue: 'Save template' })}
            </Button>
          </div>
        </Card>
      </div>
    </section>
  );
}

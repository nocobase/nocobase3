import { Plus, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { useTranslation } from '@nocobase/i18n/client';

import type { MailIdentity, MailSignature } from '../mail-client.js';
import { mailErrorMessage } from '../mail-client.js';
import { getMailClient } from '../runtime.js';
import { Button } from './ui/button.js';
import { Input } from './ui/input.js';
import { Textarea } from './ui/textarea.js';

export interface MailSignatureManagerProps {
  readonly identity: MailIdentity;
  readonly onError: (message: string) => void;
}

export function MailSignatureManager({
  identity,
  onError,
}: MailSignatureManagerProps): ReactElement {
  const { t } = useTranslation();
  const [signatures, setSignatures] = useState<readonly MailSignature[]>([]);
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const mail = getMailClient();
  const load = useCallback((): void => {
    void mail
      .listSignatures(identity.accountId, identity.id)
      .then(setSignatures, (cause: unknown) =>
        onError(
          mailErrorMessage(
            cause,
            t('errors.requestFailed', { defaultValue: 'Mail request failed.' }),
          ),
        ),
      );
  }, [identity.accountId, identity.id, mail, onError, t]);
  useEffect(() => load(), [load]);

  const save = (
    input: Pick<MailSignature, 'name' | 'text' | 'isDefault'> & {
      readonly id?: string;
    },
  ): void => {
    setSaving(true);
    void mail
      .saveSignature({
        ...input,
        accountId: identity.accountId,
        identityId: identity.id,
      })
      .then(() => {
        setName('');
        setText('');
        load();
      })
      .catch((cause: unknown) =>
        onError(
          mailErrorMessage(
            cause,
            t('errors.requestFailed', { defaultValue: 'Mail request failed.' }),
          ),
        ),
      )
      .finally(() => setSaving(false));
  };

  return (
    <div className='space-y-3'>
      {signatures.map((signature) => (
        <div className='rounded-lg border bg-background p-3' key={signature.id}>
          <div className='flex items-center gap-2'>
            <span className='font-medium'>{signature.name}</span>
            {signature.isDefault ? (
              <span className='rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary'>
                {t('settings.identities.default', { defaultValue: 'Default' })}
              </span>
            ) : null}
            <div className='ml-auto flex gap-1'>
              {!signature.isDefault ? (
                <Button
                  disabled={saving}
                  onClick={() => save({ ...signature, isDefault: true })}
                  type='button'
                  variant='outline'
                >
                  {t('settings.identities.makeDefault', {
                    defaultValue: 'Make default',
                  })}
                </Button>
              ) : null}
              <Button
                aria-label={t('settings.identities.delete', {
                  defaultValue: 'Delete signature',
                })}
                disabled={saving}
                onClick={() => {
                  setSaving(true);
                  void mail
                    .deleteSignature(
                      identity.accountId,
                      identity.id,
                      signature.id,
                    )
                    .then(load)
                    .catch((cause: unknown) =>
                      onError(
                        mailErrorMessage(
                          cause,
                          t('errors.requestFailed', {
                            defaultValue: 'Mail request failed.',
                          }),
                        ),
                      ),
                    )
                    .finally(() => setSaving(false));
                }}
                type='button'
                variant='ghost'
              >
                <Trash2 className='size-4' />
              </Button>
            </div>
          </div>
          <p className='mt-2 whitespace-pre-wrap text-sm text-muted-foreground'>
            {signature.text}
          </p>
        </div>
      ))}
      <div className='grid gap-2 rounded-lg border border-dashed p-3'>
        <Input
          aria-label={t('settings.identities.name', {
            defaultValue: 'Signature name',
          })}
          onChange={(event) => setName(event.target.value)}
          placeholder={t('settings.identities.name', {
            defaultValue: 'Signature name',
          })}
          value={name}
        />
        <Textarea
          aria-label={t('settings.identities.signatureFor', {
            address: identity.address,
            defaultValue: `Signature for ${identity.address}`,
          })}
          onChange={(event) => setText(event.target.value)}
          placeholder={t('settings.identities.signaturePlaceholder', {
            defaultValue: 'Signature appended to outgoing messages',
          })}
          value={text}
        />
        <Button
          disabled={saving || !name.trim()}
          onClick={() =>
            save({ name, text, isDefault: signatures.length === 0 })
          }
          type='button'
          variant='outline'
        >
          <Plus className='size-4' />
          {t('settings.identities.add', { defaultValue: 'Add signature' })}
        </Button>
      </div>
    </div>
  );
}

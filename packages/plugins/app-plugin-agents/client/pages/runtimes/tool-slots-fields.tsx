/**
 * Limits per coding tool beside a runtime's concurrent runs (`Runner.toolSlots`), as the runtime's settings and the
 * "Add runtime" dialog edit them: a number per tool, empty for no limit of its own.
 */
import type { AgentTool } from '@nocobase/agent-protocol';
import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '../../components/ui/field.js';
import { Input } from '../../components/ui/input.js';
import type { ToolSlotsDraft } from '../../lib/tool-slots.js';

export function ToolSlotsFields({
  idPrefix,
  tools,
  draft,
  invalid,
  disabled = false,
  onChange,
}: {
  readonly idPrefix: string;
  readonly tools: readonly AgentTool[];
  readonly draft: ToolSlotsDraft;
  readonly invalid: boolean;
  readonly disabled?: boolean;
  readonly onChange: (draft: ToolSlotsDraft) => void;
}): ReactElement | null {
  const { t } = useTranslation();
  if (tools.length === 0) return null;
  return (
    <FieldSet data-invalid={invalid ? true : undefined}>
      <FieldLegend variant='label'>{t('runtimes.toolSlots.label')}</FieldLegend>
      <FieldDescription>{t('runtimes.toolSlots.hint')}</FieldDescription>
      <div className='grid gap-2 sm:grid-cols-2'>
        {tools.map((tool) => (
          <Field key={tool} orientation='horizontal'>
            <FieldLabel
              htmlFor={`${idPrefix}-${tool}`}
              className='min-w-24 font-normal'
            >
              {t(`tools.${tool}`)}
            </FieldLabel>
            <Input
              id={`${idPrefix}-${tool}`}
              inputMode='numeric'
              className='w-24'
              placeholder={t('runtimes.toolSlots.none')}
              value={draft[tool] ?? ''}
              disabled={disabled}
              aria-invalid={invalid ? true : undefined}
              onChange={(event) =>
                onChange({ ...draft, [tool]: event.target.value })
              }
            />
          </Field>
        ))}
      </div>
      {invalid ? (
        <FieldError>{t('runtimes.toolSlots.invalid')}</FieldError>
      ) : null}
    </FieldSet>
  );
}

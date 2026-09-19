import {
  ChevronDown,
  LockKeyhole,
  MessageCircleQuestion,
  ShieldCheck,
} from 'lucide-react';
import type { ReactElement } from 'react';
import { Button } from '../../registry/nocobase-ai/shared/ui/button.js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '../../registry/nocobase-ai/shared/ui/dropdown-menu.js';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '../../registry/nocobase-ai/shared/ui/tooltip.js';
import type {
  AIEmployeeToolSetting,
  AIMetadataItem,
} from '../ai-employee-service.js';
import { useT } from '../locales/index.js';

export function EmployeeToolPermission({
  item,
  setting,
  title,
  enabled,
  disabled,
  onChange,
}: {
  item: AIMetadataItem | undefined;
  setting: AIEmployeeToolSetting | undefined;
  title: string;
  enabled: boolean;
  disabled: boolean;
  onChange: (autoCall: boolean) => void;
}): ReactElement {
  const t = useT();
  const custom = item?.scope === 'CUSTOM';
  const permission =
    custom || !item
      ? setting
        ? setting.autoCall
          ? 'ALLOW'
          : 'ASK'
        : item?.defaultPermission
      : item.defaultPermission;
  const label =
    permission === 'ALLOW'
      ? t('Allow')
      : permission === 'ASK'
        ? t('Ask')
        : t('employeeTools.permissionUnavailable');
  const Icon = permission === 'ALLOW' ? ShieldCheck : MessageCircleQuestion;
  const accessibleLabel = t('employeeTools.permission', {
    name: title,
    permission: label,
  });
  const hint = !item
    ? t('employeeTools.unavailable')
    : custom
      ? !enabled
        ? t('employeeTools.enableToEdit')
        : permission === 'ALLOW'
          ? t('employeeTools.allowHint')
          : t('employeeTools.askHint')
      : t('employeeTools.registeredPermission');
  return (
    <Tooltip>
      <TooltipTrigger
        render={<span tabIndex={custom && enabled && !disabled ? -1 : 0} />}
        className='inline-flex'
        aria-label={
          custom && enabled && !disabled ? undefined : accessibleLabel
        }
      >
        {custom ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant='outline' size='sm' />}
              disabled={disabled || !enabled}
              aria-label={accessibleLabel}
              className='min-w-28 justify-between'
            >
              <Icon data-icon='inline-start' aria-hidden='true' />
              {label}
              <ChevronDown data-icon='inline-end' aria-hidden='true' />
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end'>
              <DropdownMenuRadioGroup
                value={permission ?? 'ASK'}
                onValueChange={(value) => onChange(value === 'ALLOW')}
              >
                <DropdownMenuRadioItem value='ASK'>
                  <MessageCircleQuestion aria-hidden='true' />
                  {t('Ask')}
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value='ALLOW'>
                  <ShieldCheck aria-hidden='true' />
                  {t('Allow')}
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <span className='inline-flex min-w-28 items-center justify-between gap-2 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground'>
            <Icon className='size-4' aria-hidden='true' />
            {label}
            <LockKeyhole className='size-3' aria-hidden='true' />
          </span>
        )}
      </TooltipTrigger>
      <TooltipContent>{hint}</TooltipContent>
    </Tooltip>
  );
}

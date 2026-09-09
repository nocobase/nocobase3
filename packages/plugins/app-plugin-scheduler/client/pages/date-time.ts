const DATE_TIME_OPTIONS: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'short',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  timeZoneName: 'short',
};

function clientLocale(): string | undefined {
  return typeof document === 'undefined'
    ? undefined
    : document.documentElement.lang || undefined;
}

export function formatClientDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(clientLocale(), DATE_TIME_OPTIONS).format(date);
}

export function formatClientRelativeTime(
  value: string,
  now: Date = new Date(),
): string | undefined {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;

  const differenceSeconds = (date.getTime() - now.getTime()) / 1000;
  const absoluteSeconds = Math.abs(differenceSeconds);
  let unit: Intl.RelativeTimeFormatUnit;
  let divisor: number;
  if (absoluteSeconds < 60) {
    unit = 'second';
    divisor = 1;
  } else if (absoluteSeconds < 60 * 60) {
    unit = 'minute';
    divisor = 60;
  } else if (absoluteSeconds < 24 * 60 * 60) {
    unit = 'hour';
    divisor = 60 * 60;
  } else if (absoluteSeconds < 30 * 24 * 60 * 60) {
    unit = 'day';
    divisor = 24 * 60 * 60;
  } else if (absoluteSeconds < 365 * 24 * 60 * 60) {
    unit = 'month';
    divisor = 30 * 24 * 60 * 60;
  } else {
    unit = 'year';
    divisor = 365 * 24 * 60 * 60;
  }
  return new Intl.RelativeTimeFormat(clientLocale(), {
    numeric: 'auto',
  }).format(Math.round(differenceSeconds / divisor), unit);
}

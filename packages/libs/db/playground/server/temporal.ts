/** Return the V1 wall-clock representation required by `datetime` fields. */
export function nowDatetime(): string {
  return new Date().toISOString().slice(0, -1);
}

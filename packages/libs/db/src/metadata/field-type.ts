/** Normalize convenience declarations while preserving explicit native types. */
export function metadataFieldType(value: unknown): string | undefined {
  if (
    typeof value !== 'string' ||
    !value ||
    value.trim() !== value ||
    ['belongsTo', 'hasOne', 'hasMany', 'belongsToMany', 'relation'].includes(
      value,
    )
  )
    return undefined;
  return value === 'increments' ? 'integer' : value;
}

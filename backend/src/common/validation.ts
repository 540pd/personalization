export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && !!value.trim();
}

export function isOneOf<const T extends readonly string[]>(
  value: unknown,
  values: T
): value is T[number] {
  return typeof value === "string" && values.some((candidate) => candidate === value);
}

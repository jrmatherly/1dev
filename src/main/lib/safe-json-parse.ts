/**
 * Typed wrapper around JSON.parse that returns null on failure instead of throwing.
 *
 * Use at boundaries where untrusted or legacy-shaped JSON may be deserialized:
 * database TEXT columns holding serialized arrays/objects, config files on disk,
 * IPC payloads from upstream processes, etc. Catches both SyntaxError and
 * unexpected structural shapes when combined with a validator callback.
 *
 * @param input  Raw JSON string (or `null`/`undefined`/empty-string for convenience)
 * @param isValid Optional runtime validator. When provided, parsed values that
 *   fail the predicate are treated as invalid and `null` is returned.
 * @returns Parsed value typed as `T`, or `null` on parse failure / validation failure
 */
export function safeJsonParse<T = unknown>(
  input: string | null | undefined,
  isValid?: (value: unknown) => value is T,
): T | null {
  if (input == null || input === "") {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch {
    return null;
  }

  if (isValid && !isValid(parsed)) {
    return null;
  }

  return parsed as T;
}

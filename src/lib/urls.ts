/** A return path on this site only (no open redirect via //host or /\host). */
export function safeReturn(value: string | null | undefined, fallback = "/") {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  return value;
}

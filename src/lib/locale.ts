export function truncate(str: string, len: number): string {
  if (len <= 0) return "";
  if (str.length <= len) return str;
  // Guard len === 1 too: slice(0, 0) keeps the ellipsis only, never a negative
  // (from-end) index that would paradoxically return a longer string.
  return str.slice(0, Math.max(0, len - 1)) + "…";
}

export function titlecase(str: string): string {
  return str.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

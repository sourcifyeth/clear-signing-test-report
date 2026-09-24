/** A short, safe text for any value of a bundle. */
export function render(v: unknown): string {
  if (v === undefined) return "?";
  if (v === null) return "null";
  if (typeof v === "bigint") return v.toString();
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    return JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x));
  } catch {
    return String(v);
  }
}

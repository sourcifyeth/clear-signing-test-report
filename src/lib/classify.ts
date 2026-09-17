import type { Bundle, Case, DescriptorReport, Status } from "./bundle";

export type Verdict = "pass" | "disagree" | "all-differ" | "error" | "none";

/** What the results of one case say together. */
export function verdictOf(c: Case, implIds: string[]): Verdict {
  const statuses: Status[] = implIds.map((id) => c.results?.[id]?.status ?? "error");
  if (statuses.length === 0) return "none";
  if (statuses.every((s) => s === "pass")) return "pass";
  if (statuses.some((s) => s === "error" || s === "skipped")) return "error";
  if (statuses.every((s) => s === "fail")) return "all-differ";
  return "disagree";
}

export const VERDICT_TEXT: Record<Verdict, string> = {
  pass: "All implementations render the expected output.",
  disagree: "Implementations disagree. This points at an implementation, not at the descriptor.",
  "all-differ": "Every implementation differs from the test. This points at the descriptor or at the test.",
  error: "An implementation did not produce a result for this case.",
  none: "No implementation ran this case.",
};

export interface Counts {
  pass: number;
  fail: number;
  error: number;
  skipped: number;
  missing: number;
}

export function countsFor(d: DescriptorReport, implId: string): Counts {
  const out: Counts = { pass: 0, fail: 0, error: 0, skipped: 0, missing: 0 };
  for (const c of d.cases ?? []) {
    const r = c.results?.[implId];
    if (!r) out.missing++;
    else if (r.status in out) out[r.status as keyof Counts]++;
    else out.error++;
  }
  return out;
}

export function descriptorHasDisagreement(d: DescriptorReport, implIds: string[]): boolean {
  return (d.cases ?? []).some((c) => verdictOf(c, implIds) === "disagree");
}

/** Short pill text per verdict, for a case title. */
export const VERDICT_PILL: Record<Verdict, { text: string; tone: "pass" | "warn" | "fail" | "neutral" }> = {
  pass: { text: "pass everywhere", tone: "pass" },
  disagree: { text: "implementations disagree", tone: "warn" },
  "all-differ": { text: "fails on all runners", tone: "fail" },
  error: { text: "error", tone: "neutral" },
  none: { text: "not run", tone: "neutral" },
};

/** How many cases of a descriptor end in each verdict. */
export function verdictCounts(d: DescriptorReport, implIds: string[]): Record<Verdict, number> {
  const out: Record<Verdict, number> = { pass: 0, disagree: 0, "all-differ": 0, error: 0, none: 0 };
  for (const c of d.cases ?? []) out[verdictOf(c, implIds)]++;
  return out;
}

export function testedFormats(d: DescriptorReport): { tested: number; total: number; untested: string[] } {
  const entries = Object.entries(d.formats ?? {});
  const untested = entries.filter(([, f]) => (f.cases ?? []).length === 0).map(([k]) => k);
  return { tested: entries.length - untested.length, total: entries.length, untested };
}

export function totals(b: Bundle) {
  const implIds = b.implementations.map((i) => i.id);
  let cases = 0;
  const byVerdict: Record<Verdict, number> = { pass: 0, disagree: 0, "all-differ": 0, error: 0, none: 0 };
  for (const d of b.descriptors) {
    for (const c of d.cases ?? []) {
      cases++;
      byVerdict[verdictOf(c, implIds)]++;
    }
  }
  return { cases, byVerdict };
}

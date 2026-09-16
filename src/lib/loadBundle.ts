import { SUPPORTED_SCHEMA_VERSIONS, type Bundle, type RunIndexEntry } from "./bundle";
import { REPORTS_RAW, isHttpsUrl } from "./links";

export type Source =
  | { kind: "pr"; pr: number; run: number | null }
  | { kind: "url"; url: string }
  | { kind: "sample"; pr: number }
  | { kind: "none" };

const SAMPLES: Record<number, string> = {
  2984: "samples/pr/2984/34941958423.json",
  2994: "samples/pr/2994/35018750397.json",
};

export const SAMPLE_PRS = Object.keys(SAMPLES).map(Number);

const int = (v: string | null): number | null => (v !== null && /^\d{1,12}$/.test(v) ? Number(v) : null);

/** Reads the source of the bundle from the query string. */
export function sourceFromLocation(search: string): Source {
  const q = new URLSearchParams(search);
  const sample = int(q.get("sample"));
  if (sample !== null && SAMPLES[sample]) return { kind: "sample", pr: sample };
  const pr = int(q.get("pr"));
  if (pr !== null) return { kind: "pr", pr, run: int(q.get("run")) };
  const url = q.get("bundle");
  if (isHttpsUrl(url)) return { kind: "url", url };
  return { kind: "none" };
}

export function sampleUrl(pr: number): string {
  return `${import.meta.env.BASE_URL}${SAMPLES[pr]}`;
}

export function bundleUrl(pr: number, run: number): string {
  return `${REPORTS_RAW}/pr/${pr}/${run}.json`;
}

export function indexUrl(pr: number): string {
  return `${REPORTS_RAW}/pr/${pr}/index.json`;
}

export class BundleError extends Error {}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) throw new BundleError(`${res.status} ${res.statusText} for ${url}`);
  return res.json();
}

/** Validates the little the viewer must rely on. Everything else is data. */
export function checkBundle(data: unknown): Bundle {
  if (data === null || typeof data !== "object") throw new BundleError("The file is not a JSON object.");
  const b = data as Partial<Bundle>;
  if (typeof b.schemaVersion !== "number") throw new BundleError("The file has no schemaVersion, so it is not a test report bundle.");
  if (!SUPPORTED_SCHEMA_VERSIONS.includes(b.schemaVersion)) {
    throw new BundleError(
      `This bundle has schema version ${b.schemaVersion}. This viewer reads version ${SUPPORTED_SCHEMA_VERSIONS.join(", ")}. Update the viewer.`,
    );
  }
  if (!Array.isArray(b.descriptors)) throw new BundleError("The bundle has no descriptors array.");
  return {
    schemaVersion: b.schemaVersion,
    generatedAt: typeof b.generatedAt === "string" ? b.generatedAt : "",
    run: { id: null, url: null, startedAt: null, completedAt: null, ...(b.run ?? {}) },
    pr: { number: null, url: null, title: null, headSha: null, headRepo: null, baseSha: null, ...(b.pr ?? {}) },
    implementations: Array.isArray(b.implementations) ? b.implementations : [],
    missingTests: Array.isArray(b.missingTests) ? b.missingTests.filter((s) => typeof s === "string") : [],
    descriptors: b.descriptors.filter((d) => d && typeof d === "object"),
  };
}

export interface Loaded {
  bundle: Bundle;
  url: string | null;
  index: RunIndexEntry[] | null;
}

/** pr/<n>/index.json: { indexVersion, pr, updatedAt, runs: [...] }, newest first. */
export async function loadIndex(pr: number): Promise<RunIndexEntry[]> {
  const data = await fetchJson(indexUrl(pr));
  const runs = Array.isArray(data) ? data : data && typeof data === "object" ? (data as { runs?: unknown }).runs : null;
  if (!Array.isArray(runs)) throw new BundleError("The run index has no runs array.");
  return runs.filter((e): e is RunIndexEntry => !!e && typeof e === "object" && typeof (e as RunIndexEntry).runId === "number");
}

export async function load(source: Source): Promise<Loaded> {
  switch (source.kind) {
    case "sample": {
      const url = sampleUrl(source.pr);
      return { bundle: checkBundle(await fetchJson(url)), url, index: null };
    }
    case "url":
      return { bundle: checkBundle(await fetchJson(source.url)), url: source.url, index: null };
    case "pr": {
      let index: RunIndexEntry[] | null = null;
      let run = source.run;
      if (run === null) {
        index = await loadIndex(source.pr);
        if (index.length === 0) throw new BundleError(`No run is indexed for pull request ${source.pr}.`);
        run = index[0].runId;
      } else {
        index = await loadIndex(source.pr).catch(() => null);
      }
      const url = bundleUrl(source.pr, run);
      return { bundle: checkBundle(await fetchJson(url)), url, index };
    }
    case "none":
      throw new BundleError("No bundle to load.");
  }
}

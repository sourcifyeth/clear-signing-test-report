/**
 * The test report bundle, as build-bundle.js in the registry writes it.
 * Reference: .github/test-runner-docs/bundle.md in
 * ethereum/clear-signing-erc7730-registry. Every string under `descriptors`
 * comes from a pull request (a fork) and is untrusted.
 */

export const SUPPORTED_SCHEMA_VERSIONS = [1];

export type Status = "pass" | "fail" | "error" | "skipped";

export interface RenderedField {
  label: string | undefined;
  value: string | Rendered | unknown;
}

export interface Rendered {
  intent?: string;
  interpolatedIntent?: string;
  owner?: string;
  fields?: RenderedField[];
}

export interface DiffEntry {
  path: string;
  expected: unknown;
  got: unknown;
}

export interface CaseResult {
  status: Status;
  rendered: Rendered | null;
  message: string | null;
  warnings: unknown[];
  format: string | null;
  chainId: number | null;
  durationMs: number | null;
  diff: DiffEntry[] | null;
}

export interface CaseInput {
  type: "calldata" | "eip712" | "unknown";
  chainId?: number | null;
  to?: string | null;
  value?: string;
  selector?: string | null;
  txType?: string | null;
  primaryType?: string | null;
  error?: string;
}

export interface Case {
  description: string;
  index: number;
  input: CaseInput;
  format: string | null;
  expected: Rendered;
  from: string | null;
  txHash: string | null;
  results: Record<string, CaseResult>;
}

export interface FormatEntry {
  selector: string | null;
  primaryType: string | null;
  error: string | null;
  cases: string[];
}

/**
 * A suggestion to improve a descriptor. Known types are
 * "no-interpolated-intent" (with `format`) and "deprecated-key" (with `key`);
 * other types are shown with their `message`. `file` is the file that
 * declares the format or key, which can be a shared file that the descriptor
 * includes; `pointer` is a JSON pointer into that file. Every value is a
 * string: loadBundle drops the other fields.
 */
export interface Recommendation {
  type: string;
  format?: string;
  key?: string;
  file?: string;
  pointer?: string;
  message?: string;
}

export interface DescriptorField {
  label?: string;
  format?: string;
  params?: Record<string, unknown> | null;
  path?: string;
  visible?: string;
  fields?: DescriptorField[];
  $ref?: string;
  value?: unknown;
}

export interface DescriptorFormat {
  intent?: string | Record<string, unknown>;
  interpolatedIntent?: string | null;
  fields?: DescriptorField[];
  required?: string[];
  excluded?: string[];
  $id?: string;
}

export interface Deployment {
  chainId: number;
  address: string;
}

export interface Descriptor {
  context?: {
    $id?: string;
    contract?: { deployments?: Deployment[]; abi?: unknown };
    eip712?: { deployments?: Deployment[]; domain?: Record<string, unknown>; schemas?: unknown };
  };
  metadata?: { owner?: string; constants?: Record<string, unknown>; info?: unknown; [k: string]: unknown };
  display?: { formats?: Record<string, DescriptorFormat>; definitions?: Record<string, DescriptorField> };
  [k: string]: unknown;
}

export interface DescriptorReport {
  path: string;
  entity: string;
  name: string;
  kind: "calldata" | "eip712";
  change: { descriptor: string; tests: string };
  testFile: string | null;
  head: Descriptor | null;
  base: Descriptor | null;
  dataProvider: Record<string, unknown> | null;
  formats: Record<string, FormatEntry>;
  recommendations: Recommendation[];
  cases: Case[];
}

export interface Implementation {
  id: string;
  runner: string | null;
  implementation: string | null;
}

export interface Bundle {
  schemaVersion: number;
  generatedAt: string;
  run: { id: number | null; url: string | null; startedAt: string | null; completedAt: string | null };
  pr: {
    number: number | null;
    url: string | null;
    title: string | null;
    headSha: string | null;
    headRepo: string | null;
    baseSha: string | null;
  };
  implementations: Implementation[];
  missingTests: string[];
  descriptors: DescriptorReport[];
  /** The suggestions for every changed file, shared files included. Absent in older bundles. */
  recommendations?: Recommendation[];
}

/** An entry of pr/<n>/index.json on the test-reports branch. */
export interface RunIndexEntry {
  runId: number;
  runUrl?: string | null;
  headSha: string;
  startedAt: string | null;
  completedAt: string | null;
  generatedAt?: string | null;
  schemaVersion?: number;
  summary?: {
    descriptors?: number;
    missingTests?: number;
    cases?: number;
    byStatus?: Record<string, Record<string, number>>;
    disagreements?: number;
  };
}

export const isRendered = (v: unknown): v is Rendered =>
  v !== null && typeof v === "object" && !Array.isArray(v) && "fields" in (v as object);

/** One line of text for a suggestion. */
export function recommendationText(r: Recommendation): string {
  if (r.type === "no-interpolated-intent" && r.format) return `${formatName(r.format)}: no interpolatedIntent`;
  if (r.type === "deprecated-key" && r.key) return `uses the deprecated key ${r.key}`;
  return r.message ?? r.type;
}

/** Short name of a format key: the function or type name. */
export const formatName = (key: string | null): string => (key ? key.split("(")[0] : "—");

/**
 * Field provenance: the raw argument behind each rendered field. The viewer
 * fetches the test file at the head commit, decodes the calldata with the
 * function signature that the descriptor's format key is, and walks the
 * descriptor's paths into the decoded arguments. All of it is best effort:
 * an unresolved path shows "?".
 */
import { decodeFunctionData, parseAbiItem, parseTransaction, type AbiFunction, type AbiParameter, type Hex } from "viem";
import type { Case, Descriptor, DescriptorField, DescriptorFormat, DescriptorReport, RenderedField } from "./bundle";
import { isRendered } from "./bundle";

export interface TestFileCase {
  description?: string;
  rawTx?: string;
  from?: string;
  txHash?: string;
  data?: { types?: unknown; primaryType?: string; domain?: Record<string, unknown>; message?: Record<string, unknown> };
  expected?: unknown;
}

export interface Decoded {
  /** Function parameters by name, or the EIP-712 message. */
  params: Record<string, unknown>;
  /** ABI types by parameter name, for the hints. Calldata only. */
  types: AbiParameter[];
  tx: { to: string | null; value: bigint | null; from: string | null };
  error: string | null;
}

/** Decodes one test case. `format` is the descriptor's format key. */
export function decodeCase(test: TestFileCase, format: string | null, kind: "calldata" | "eip712"): Decoded {
  const out: Decoded = { params: {}, types: [], tx: { to: null, value: null, from: test.from ?? null }, error: null };
  try {
    if (kind === "eip712") {
      out.params = test.data?.message && typeof test.data.message === "object" ? test.data.message : {};
      const vc = test.data?.domain?.verifyingContract;
      out.tx.to = typeof vc === "string" ? vc : null;
      return out;
    }
    if (typeof test.rawTx !== "string") throw new Error("the test has no rawTx");
    const tx = parseTransaction(test.rawTx as Hex);
    out.tx.to = tx.to ?? null;
    out.tx.value = tx.value ?? 0n;
    if (!format) throw new Error("no format matched, so the arguments cannot be named");
    const item = parseAbiItem(`function ${format}`) as AbiFunction;
    const data = tx.data ?? "0x";
    const decoded = decodeFunctionData({ abi: [item], data });
    const args = (decoded.args ?? []) as unknown[];
    out.types = [...item.inputs];
    item.inputs.forEach((input, i) => {
      out.params[input.name ?? `arg${i}`] = args[i];
    });
    return out;
  } catch (e) {
    out.error = e instanceof Error ? ((e as { shortMessage?: string }).shortMessage ?? e.message) : String(e);
    return out;
  }
}

/** Path segments of an ERC-7730 path body: "a.b[0].c" → ["a","b","0","c"], "[]" → "[]". */
function segments(body: string): string[] {
  const out: string[] = [];
  for (const part of body.split(".")) {
    if (part === "") continue;
    const m = part.match(/^([^[]*)((\[[^\]]*\])*)$/);
    if (!m) {
      out.push(part);
      continue;
    }
    if (m[1] !== "") out.push(m[1]);
    for (const idx of m[2].match(/\[[^\]]*\]/g) ?? []) out.push(idx === "[]" ? "[]" : idx.slice(1, -1));
  }
  return out;
}

function walk(root: unknown, segs: string[]): unknown {
  let cur: unknown = root;
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    if (cur === null || cur === undefined) return undefined;
    if (s === "[]") {
      if (!Array.isArray(cur)) return undefined;
      const rest = segs.slice(i + 1);
      return cur.map((el) => walk(el, rest));
    }
    if (Array.isArray(cur) && /^-?\d+$/.test(s)) {
      const n = Number(s);
      cur = cur[n < 0 ? cur.length + n : n];
      continue;
    }
    if (typeof cur === "object") {
      cur = (cur as Record<string, unknown>)[s];
      continue;
    }
    return undefined;
  }
  return cur;
}

/** The value a descriptor path points at, or undefined. */
export function resolvePath(path: string | undefined, decoded: Decoded, descriptor: Descriptor | null): unknown {
  if (typeof path !== "string" || path === "") return undefined;
  if (path.startsWith("#.")) return walk(decoded.params, segments(path.slice(2)));
  if (path === "#") return decoded.params;
  if (path.startsWith("@.")) {
    const key = path.slice(2);
    if (key === "value") return decoded.tx.value;
    if (key === "to") return decoded.tx.to;
    if (key === "from") return decoded.tx.from;
    return undefined;
  }
  if (path.startsWith("$.")) return walk(descriptor, segments(path.slice(2)));
  // EIP-712 paths name the message field directly.
  return walk(decoded.params, segments(path));
}

/** The ABI type behind a "#." path, when it can be followed. */
export function typeOfPath(path: string | undefined, types: AbiParameter[]): string | null {
  if (typeof path !== "string" || !path.startsWith("#.")) return null;
  let params: readonly AbiParameter[] = types;
  let type: string | null = null;
  for (const s of segments(path.slice(2))) {
    if (s === "[]" || /^-?\d+$/.test(s)) {
      if (type?.endsWith("]")) type = type.replace(/\[[^\]]*\]$/, "");
      continue;
    }
    const p = params.find((x) => x.name === s);
    if (!p) return null;
    type = p.type;
    params = "components" in p && Array.isArray(p.components) ? p.components : [];
  }
  return type;
}

/** A short, safe text for any decoded value. */
export function show(v: unknown, max = 80): string {
  const text = render(v);
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

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

// ---------------------------------------------------------------------------
// Descriptor fields, flattened, and matched to rendered fields
// ---------------------------------------------------------------------------

export interface FlatField {
  label: string;
  format: string | null;
  params: Record<string, unknown> | null;
  path: string | undefined;
  visible: string | undefined;
}

function joinPath(parent: string | undefined, child: string | undefined): string | undefined {
  if (!child) return parent;
  if (/^[#@$]/.test(child) || !parent) return child;
  return `${parent}.${child}`;
}

/** The fields of a format in display order, groups flattened, $ref followed. */
export function flattenFields(format: DescriptorFormat | undefined, descriptor: Descriptor | null): FlatField[] {
  const out: FlatField[] = [];
  const defs = descriptor?.display?.definitions ?? {};
  const visit = (fields: DescriptorField[] | undefined, parentPath: string | undefined, depth: number) => {
    if (!Array.isArray(fields) || depth > 6) return;
    for (let f of fields) {
      if (!f || typeof f !== "object") continue;
      if (typeof f.$ref === "string") {
        const key = f.$ref.replace(/^\$\.display\.definitions\./, "");
        const def = defs[key];
        if (def) f = { ...def, ...f, params: { ...(def.params ?? {}), ...(f.params ?? {}) } };
      }
      const path = joinPath(parentPath, f.path);
      if (Array.isArray(f.fields)) {
        visit(f.fields, path, depth + 1);
        continue;
      }
      out.push({
        label: typeof f.label === "string" ? f.label : "",
        format: typeof f.format === "string" ? f.format : null,
        params: f.params && typeof f.params === "object" ? f.params : null,
        path,
        visible: typeof f.visible === "string" ? f.visible : undefined,
      });
    }
  };
  visit(format?.fields, undefined, 0);
  return out;
}

export interface ProvenanceRow {
  label: string;
  rendered: string;
  nested: boolean;
  field: FlatField | null;
  certain: boolean;
  raw: unknown;
  type: string | null;
  hints: string[];
}

/** Rendered fields matched to descriptor fields by label, then by position. */
export function provenance(c: Case, d: DescriptorReport, decoded: Decoded | null): ProvenanceRow[] {
  const format = c.format && d.head?.display?.formats ? d.head.display.formats[c.format] : undefined;
  const flat = flattenFields(format, d.head);
  const used = new Set<number>();
  const rendered: RenderedField[] = Array.isArray(c.expected?.fields) ? c.expected.fields : [];
  const rows: ProvenanceRow[] = [];
  const noIntent = format ? format.interpolatedIntent == null || format.interpolatedIntent === "" : false;

  rendered.forEach((rf, i) => {
    const label = typeof rf.label === "string" ? rf.label : "";
    let idx = flat.findIndex((f, j) => !used.has(j) && f.label === label);
    let certain = idx >= 0;
    if (idx < 0) {
      idx = flat.findIndex((_f, j) => !used.has(j) && j >= i);
      if (idx < 0) idx = flat.findIndex((_f, j) => !used.has(j));
      certain = false;
    }
    const field = idx >= 0 ? flat[idx] : null;
    if (idx >= 0) used.add(idx);
    const raw = decoded && field ? resolvePath(field.path, decoded, d.head) : undefined;
    const type = decoded && field ? typeOfPath(field.path, decoded.types) : null;
    const nested = isRendered(rf.value);
    const renderedText = nested ? "(nested call)" : render(rf.value);
    const hints: string[] = [];
    if (field) {
      const fmt = field.format ?? "";
      if (type && /^u?int\d*$/.test(type) && fmt === "raw") hints.push("integer shown raw; tokenAmount, amount, date or unit may fit");
      if (type === "address" && !["addressName", "tokenAmount", "nftName"].includes(fmt)) hints.push("address without addressName");
      if (type && /^bytes\d*$/.test(type) && fmt === "raw" && type === "bytes") hints.push("bytes shown raw; calldata may fit");
    }
    if (!nested && renderedText.length > 60) hints.push("long value on a small screen");
    if (i === 0 && noIntent) hints.push("format has no interpolatedIntent");
    rows.push({ label, rendered: renderedText, nested, field, certain, raw, type, hints });
  });
  return rows;
}

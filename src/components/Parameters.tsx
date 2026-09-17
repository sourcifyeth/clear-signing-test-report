import { useMemo } from "react";
import type { AbiParameter } from "viem";
import type { Case, DescriptorReport } from "../lib/bundle";
import { decodeCase, flattenFields, render } from "../lib/decode";
import { useFunctionDocs, type TestFileState } from "../lib/hooks";

interface Props {
  c: Case;
  d: DescriptorReport;
  testFile: TestFileState;
}

/** One parameter, or one component of a tuple parameter, with what the descriptor does with it. */
interface ParamRow {
  path: string; // the ERC-7730 path body, e.g. "_proof.data.requestBody"
  name: string;
  type: string;
  depth: number;
  /** Labels of the descriptor fields that display this value, or a value under it. */
  shownAs: string[];
  /** A parent whose children are only partly displayed. */
  partly: boolean;
  /** Hidden on purpose: declared with visible "never", or listed in the format's excluded list. Null when the descriptor does not mention the value. */
  excluded: "never" | "excluded" | null;
  doc: string | null;
  value: unknown;
}

/** The EIP-712 message fields of the primary type, as ABI-like parameters. */
function eip712Params(types: unknown, primaryType: string | null): AbiParameter[] {
  if (!types || typeof types !== "object" || !primaryType) return [];
  const list = (types as Record<string, unknown>)[primaryType];
  if (!Array.isArray(list)) return [];
  return list.filter((f) => f && typeof f === "object" && typeof f.name === "string" && typeof f.type === "string").map((f) => ({ name: f.name as string, type: f.type as string }));
}

function rows(params: AbiParameter[], values: Record<string, unknown>, fieldPaths: string[], docs: Record<string, string>, prefix: "#." | ""): ParamRow[] {
  const out: ParamRow[] = [];
  const shownBy = (path: string) => {
    // A field displays this parameter when its path is the parameter, or goes under it.
    const full = `${prefix}${path}`;
    // "[0]" in the element path matches "[]" or "[0]" in a descriptor path.
    const generic = full.replace(/\[\d+\]/g, "[]");
    return fieldPaths.filter((p) => {
      const q = p.replace(/\.\[/g, "[");
      return q === full || q === generic || q.startsWith(`${full}.`) || q.startsWith(`${generic}.`) || q.startsWith(`${full}[`) || q.startsWith(`${generic}[`);
    });
  };
  const MAX_ITEMS = 5;
  const isExcluded = (path: string): "never" | "excluded" | null => {
    const full = `${prefix}${path}`;
    const generic = full.replace(/\[\d+\]/g, "[]");
    const hit = excludedPaths.find((e) => {
      const q = e.path.replace(/\.\[/g, "[").replace(/\[\]$/, "");
      return q === full || q === generic || full.startsWith(`${q}.`) || generic.startsWith(`${q}.`) || full.startsWith(`${q}[`);
    });
    return hit ? hit.kind : null;
  };
  const isArrayType = (t: string) => /\[\d*\]$/.test(t);
  const elementType = (t: string) => t.replace(/\[\d*\]$/, "");
  const visit = (p: AbiParameter, path: string, value: unknown, depth: number) => {
    const shown = shownBy(path);
    const components = "components" in p && Array.isArray(p.components) ? p.components : null;
    const row: ParamRow = {
      path,
      name: p.name ?? path,
      type: p.type,
      depth,
      shownAs: [],
      partly: false,
      excluded: isExcluded(path),
      doc: depth === 0 ? (docs[p.name ?? ""] ?? null) : null,
      value,
    };
    out.push(row);
    const before = out.length;
    if (components && depth < 4 && isArrayType(p.type) && Array.isArray(value)) {
      // An array of structs: one block per element, up to a cap.
      row.value = `${value.length} item${value.length === 1 ? "" : "s"}`;
      row.shownAs = labelsOf(fieldPaths.filter((f) => f === `${prefix}${path}` || f.startsWith(`${prefix}${path}[]`)));
      value.slice(0, MAX_ITEMS).forEach((el, i) => {
        visit({ ...p, type: elementType(p.type), name: `${p.name ?? ""}[${i}]` } as AbiParameter, `${path}[${i}]`, el, depth + 1);
      });
      if (value.length > MAX_ITEMS) out.push({ path: `${path}[…]`, name: `… ${value.length - MAX_ITEMS} more`, type: "", depth: depth + 1, shownAs: [], partly: false, excluded: null, doc: null, value: undefined });
    } else if (components && depth < 4 && !isArrayType(p.type)) {
      // A struct: its components carry the values; the struct row only counts them.
      row.value = `struct, ${components.length} field${components.length === 1 ? "" : "s"}`;
      row.shownAs = labelsOf(fieldPaths.filter((f) => f === `${prefix}${path}`));
      const obj = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
      for (const comp of components) {
        const name = comp.name ?? "";
        visit(comp, `${path}.${name}`, obj ? obj[name] : undefined, depth + 1);
      }
    } else {
      row.shownAs = labelsOf(shown);
      return;
    }
    // A parent is "partly shown" when some of its children are and some are not.
    const children = out.slice(before).filter((r) => r.depth === depth + 1 && r.type !== "");
    const childShown = children.some((r) => r.shownAs.length > 0 || r.partly);
    const childHidden = children.some((r) => r.shownAs.length === 0 && !r.partly);
    if (row.shownAs.length === 0 && !childShown && children.length > 0 && children.every((r) => r.excluded)) row.excluded = children[0].excluded;
    if (row.shownAs.length === 0) {
      if (childShown && childHidden) row.partly = true;
      else if (childShown) row.shownAs = ["(all parts)"];
    }
  };
  const labelsOf = (paths: string[]) => paths.map((p) => labelByPath.get(p) ?? p).filter((v, i, a) => a.indexOf(v) === i);
  const labelByPath = new Map<string, string>();
  for (const f of flatFieldsForLabels) labelByPath.set(f.path, f.label);
  for (const p of params) visit(p, p.name ?? "", values[p.name ?? ""], 0);
  return out;
}

/**
 * The guide segments before a row, one per depth level: "pipe" when an
 * ancestor at that level has later siblings, "blank" when not, and for the
 * row's own level "tee" or "elbow" for a middle or a last child.
 */
function treeGuides(list: ParamRow[], i: number): ("pipe" | "blank" | "tee" | "elbow")[] {
  const r = list[i];
  if (r.depth === 0) return [];
  const hasLaterSibling = (from: number, depth: number) => {
    for (let j = from + 1; j < list.length; j++) {
      if (list[j].depth < depth) return false;
      if (list[j].depth === depth) return true;
    }
    return false;
  };
  const out: ("pipe" | "blank" | "tee" | "elbow")[] = [];
  // Levels 1 .. depth-1 belong to the ancestors: find each ancestor row.
  for (let level = 1; level < r.depth; level++) {
    let anc = -1;
    for (let j = i - 1; j >= 0; j--) {
      if (list[j].depth === level) {
        anc = j;
        break;
      }
      if (list[j].depth < level) break;
    }
    out.push(anc >= 0 && hasLaterSibling(anc, level) ? "pipe" : "blank");
  }
  out.push(hasLaterSibling(i, r.depth) ? "tee" : "elbow");
  return out;
}

// Module-level scratch, set per render before rows() runs. Kept simple on purpose.
let flatFieldsForLabels: { path: string; label: string }[] = [];
let excludedPaths: { path: string; kind: "never" | "excluded" }[] = [];

/** The function parameters of a test case, which ones the descriptor shows, their NatSpec, and the decoded transaction. */
export function Parameters({ c, d, testFile }: Props) {
  const test = testFile.cases.get(c.description) ?? null;
  const decoded = useMemo(() => (test ? decodeCase(test, c.format, d.kind) : null), [test, c.format, d.kind]);
  const docs = useFunctionDocs(c.input?.chainId ?? null, c.input?.to ?? null, d.kind === "calldata" ? c.format : null);

  const list = useMemo(() => {
    const format = c.format ? d.head?.display?.formats?.[c.format] : undefined;
    const all = flattenFields(format, d.head ?? null).filter((f) => typeof f.path === "string");
    // A field with visible "never", and a path in the format's "excluded"
    // list, are hidden on purpose: the author saw the value and left it out.
    const fields = all.filter((f) => f.visible !== "never");
    const excludedList = Array.isArray((format as { excluded?: unknown } | undefined)?.excluded) ? ((format as { excluded: unknown[] }).excluded.filter((x): x is string => typeof x === "string")) : [];
    excludedPaths = [
      ...all.filter((f) => f.visible === "never").map((f) => ({ path: f.path as string, kind: "never" as const })),
      ...excludedList.map((path) => ({ path, kind: "excluded" as const })),
    ];
    flatFieldsForLabels = fields.map((f) => ({ path: f.path as string, label: f.label }));
    const fieldPaths = fields.map((f) => f.path as string);
    if (d.kind === "eip712") {
      const params = eip712Params(test?.data?.types, c.input?.primaryType ?? test?.data?.primaryType ?? null);
      return rows(params, decoded?.params ?? {}, fieldPaths, {}, "");
    }
    const params = decoded?.types ?? [];
    return rows(params, decoded?.params ?? {}, fieldPaths, docs.params, "#.");
  }, [c, d, test, decoded, docs.params]);

  // Count leaves, not structs: a struct row only summarises its components.
  const leaf = (r: ParamRow) => r.type !== "" && !r.type.startsWith("tuple");
  const underShownParent = (r: ParamRow) => list.some((p) => p.depth < r.depth && r.path.startsWith(`${p.path}.`) && p.shownAs.length > 0);
  const hidden = list.filter((r) => leaf(r) && r.shownAs.length === 0 && !r.excluded && !underShownParent(r));
  const never = list.filter((r) => leaf(r) && r.shownAs.length === 0 && r.excluded === "never");
  const excluded = list.filter((r) => leaf(r) && r.shownAs.length === 0 && r.excluded === "excluded");
  const note =
    testFile.status === "loading"
      ? "Reading the test file to decode the transaction…"
      : testFile.status === "error"
        ? `The transaction cannot be decoded: ${testFile.message}`
        : !test
          ? "The transaction cannot be decoded: the case is not in the test file at the head commit."
          : decoded?.error
            ? `The transaction cannot be decoded: ${decoded.error}`
            : null;

  return (
    <details className="params">
      <summary>
        <span className="section-title">Function parameters</span>
        <span className="section-sub">
          {d.kind === "eip712" ? "the fields of the signed message" : "every argument of the call"}, and whether the descriptor shows it to the signer
          {docs.source === "verified" ? ". NatSpec from the verified source on Sourcify." : docs.source === "none" && d.kind === "calldata" ? ". No NatSpec: the contract or its implementation is not verified on Sourcify." : ""}
        </span>
      </summary>
      {note && <div className="muted small">{note}</div>}
      {docs.notice && <p className="small params-notice">“{docs.notice}”</p>}
      {docs.details && (
        <p className="small params-notice">
          <span className="muted">@dev</span> {docs.details}
        </p>
      )}
      {list.length > 0 && (
        <div className="tablewrap">
          <table className="params-table">
            <thead>
              <tr>
                <th>Parameter</th>
                <th>Type</th>
                <th>Decoded value</th>
                <th>Shown to the signer</th>
                <th>NatSpec</th>
              </tr>
            </thead>
            <tbody>
              {list.map((r, i) => (
                <tr key={r.path} className={r.depth > 0 ? "sub" : ""}>
                  <td className="mono name-cell" style={{ paddingLeft: `${10 + r.depth * 16}px` }}>
                    <span className="tree" aria-hidden="true">
                      {treeGuides(list, i).map((g, k) => (
                        <span key={k} className={`tree-seg ${g}`} />
                      ))}
                    </span>
                    {r.depth > 0 ? r.name.replace(/^.*\./, "") : r.name}
                  </td>
                  <td className="mono muted">{r.type}</td>
                  <td className="mono value">{r.value === undefined ? <span className="muted">—</span> : render(r.value)}</td>
                  <td>
                    {r.shownAs.length > 0 ? (
                      <span className="pass-text">as {r.shownAs.join(", ")}</span>
                    ) : r.partly ? (
                      <span className="warn-text">partly, see components</span>
                    ) : r.depth > 0 && list.find((p) => r.path.startsWith(`${p.path}.`) && p.depth < r.depth && p.shownAs.length > 0) ? (
                      <span className="muted">with its parent</span>
                    ) : r.excluded === "never" ? (
                      <span className="warn-text">
                        hidden: <span className="mono">visible: never</span>
                      </span>
                    ) : r.excluded === "excluded" ? (
                      <span className="warn-text">hidden: in the excluded list</span>
                    ) : (
                      <span className="fail-text">not in the descriptor</span>
                    )}
                  </td>
                  <td className="small doc">{r.doc ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {never.length > 0 && (
        <div className="small warn-text">
          {never.length} value{never.length === 1 ? " is" : "s are"} declared in the descriptor with <span className="mono">visible: never</span>, so the wallet skips {never.length === 1 ? "it" : "them"}:{" "}
          <span className="mono">{never.map((r) => r.path).join(", ")}</span>. The author saw {never.length === 1 ? "it" : "them"} and chose to hide {never.length === 1 ? "it" : "them"}; check that the choice is right.
        </div>
      )}
      {excluded.length > 0 && (
        <div className="small warn-text">
          {excluded.length} value{excluded.length === 1 ? " is" : "s are"} in the format's <span className="mono">excluded</span> list: <span className="mono">{excluded.map((r) => r.path).join(", ")}</span>. The
          author chose to leave {excluded.length === 1 ? "it" : "them"} out; check that the choice is right.
        </div>
      )}
      {hidden.length > 0 && (
        <div className="small fail-text">
          {hidden.length} value{hidden.length === 1 ? " is" : "s are"} not in the descriptor at all, neither shown nor declared as hidden: <span className="mono">{hidden.map((r) => r.path).join(", ")}</span>.
          The signer never sees {hidden.length === 1 ? "it" : "them"}, and the author may have missed {hidden.length === 1 ? "it" : "them"}. Check that none moves value or sets a recipient.
        </div>
      )}
    </details>
  );
}

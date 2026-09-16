import { useMemo } from "react";
import type { Case, DescriptorReport } from "../lib/bundle";
import { decodeCase, provenance, render, show } from "../lib/decode";
import type { TestFileState } from "../lib/hooks";

interface Props {
  c: Case;
  d: DescriptorReport;
  testFile: TestFileState;
}

function params(p: Record<string, unknown> | null): string {
  if (!p) return "";
  return Object.entries(p)
    .map(([k, v]) => `${k}: ${show(v, 40)}`)
    .join(" · ");
}

/** One row per expected field: descriptor definition, raw argument, rendered value, hints. */
export function Provenance({ c, d, testFile }: Props) {
  const test = testFile.cases.get(c.description) ?? null;
  const decoded = useMemo(() => (test ? decodeCase(test, c.format, d.kind) : null), [test, c.format, d.kind]);
  const rows = useMemo(() => provenance(c, d, decoded), [c, d, decoded]);
  const note =
    testFile.status === "loading"
      ? "Reading the test file to decode the arguments…"
      : testFile.status === "error"
        ? `Raw arguments unavailable: ${testFile.message}`
        : !test
          ? "Raw arguments unavailable: the case is not in the test file at the head commit."
          : decoded?.error
            ? `Raw arguments unavailable: ${decoded.error}`
            : null;
  return (
    <div className="prov">
      {note && <div className="prov-note muted small">{note}</div>}
      <div className="tablewrap">
        <table className="prov-table">
          <thead>
            <tr>
              <th>Label</th>
              <th>Descriptor field</th>
              <th>Raw argument</th>
              <th>Rendered</th>
              <th>Hint</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="muted">
                  No field.
                </td>
              </tr>
            )}
            {rows.map((r, i) => (
              <tr key={i} className={r.certain ? "" : "uncertain"}>
                <td>{r.label || <span className="muted">(no label)</span>}</td>
                <td className="mono small">
                  {r.field ? (
                    <>
                      <span className="fmt">{r.field.format ?? "?"}</span>
                      {r.field.params && <span className="muted"> {params(r.field.params)}</span>}
                      <div className="muted">{r.field.path ?? ""}</div>
                      {!r.certain && <div className="muted">matched by position</div>}
                    </>
                  ) : (
                    <span className="muted">no descriptor field found</span>
                  )}
                </td>
                <td className="mono small" title={decoded ? render(r.raw) : ""}>
                  {r.type && <span className="muted">{r.type} </span>}
                  {decoded ? show(r.raw, 48) : "…"}
                </td>
                <td className="mono small" title={r.rendered}>
                  {show(r.rendered, 60)}
                </td>
                <td className="small muted">{r.hints.join("; ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

import { useState } from "react";
import { formatName, type Bundle, type Case, type DescriptorReport, type Status } from "../lib/bundle";
import { VERDICT_TEXT, verdictOf } from "../lib/classify";
import { render } from "../lib/decode";
import type { TestFileState } from "../lib/hooks";
import { contractUrl, isTxHash } from "../lib/links";
import type { ChainInfo } from "../lib/sourcify";
import { Provenance } from "./Provenance";
import { Screen } from "./Screen";

interface Props {
  bundle: Bundle;
  d: DescriptorReport;
  c: Case;
  chains: Map<number, ChainInfo>;
  testFile: TestFileState;
}

const STATUS_TEXT: Record<Status, string> = { pass: "pass", fail: "fail", error: "error", skipped: "skipped" };

function wei(v: string | undefined): string | null {
  if (!v || !/^\d+$/.test(v)) return null;
  if (v === "0") return null;
  const n = BigInt(v);
  const whole = n / 10n ** 18n;
  const frac = (n % 10n ** 18n).toString().padStart(18, "0").replace(/0+$/, "");
  return `${whole}${frac ? "." + frac : ""} native`;
}

export function CaseCard({ bundle, d, c, chains, testFile }: Props) {
  const implIds = bundle.implementations.map((i) => i.id);
  const verdict = verdictOf(c, implIds);
  const [open, setOpen] = useState(verdict !== "pass");
  const input = c.input ?? { type: "unknown" };
  const chain = typeof input.chainId === "number" ? chains.get(input.chainId)?.name ?? `chain ${input.chainId}` : null;
  const toUrl = contractUrl(input.chainId, input.to);
  const value = wei(input.value);

  return (
    <article className={`case verdict-${verdict}`} id={`case-${d.entity}-${d.name}-${c.index}`}>
      <header className="case-head">
        <div className="case-title">
          <span className={`verdict-dot ${verdict}`} aria-hidden="true" />
          <h4>{c.description}</h4>
        </div>
        <div className="case-meta mono small">
          <span title={c.format ?? ""}>{formatName(c.format)}</span>
          {chain && <span>{chain}</span>}
          {input.to && (toUrl ? <a href={toUrl} target="_blank" rel="noreferrer">{input.to}</a> : <span>{input.to}</span>)}
          {value && <span>{value}</span>}
          {c.from && <span>from {c.from}</span>}
          {isTxHash(c.txHash) && <span title="transaction hash">tx {c.txHash.slice(0, 10)}…</span>}
          {input.error && <span className="warn-text">{input.error}</span>}
        </div>
      </header>

      <div className="case-body">
        <div className="expected">
          <div className="col-title">Expected · from the test file</div>
          <Screen rendered={c.expected} />
        </div>
        <div className="impls">
          {bundle.implementations.map((impl) => {
            const r = c.results?.[impl.id];
            const status: Status = r?.status ?? "error";
            const diffPaths = new Set((r?.diff ?? []).map((e) => e.path));
            return (
              <div key={impl.id} className={`impl status-${status}`}>
                <div className="col-title">
                  <span className="impl-name">{impl.implementation ?? impl.id}</span>
                  <span className={`pill ${status}`}>{STATUS_TEXT[status]}</span>
                </div>
                {r?.rendered ? (
                  <Screen rendered={r.rendered} diffPaths={diffPaths} />
                ) : (
                  <div className="screen screen-empty">{r ? "No rendered output." : "No result from this implementation."}</div>
                )}
                {r?.message && <div className="message mono small">{r.message}</div>}
                {Array.isArray(r?.warnings) && r.warnings.length > 0 && (
                  <ul className="warnings small">
                    {r.warnings.map((w, i) => (
                      <li key={i}>{render(w)}</li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className={`verdict-line ${verdict}`}>{VERDICT_TEXT[verdict]}</div>

      <details className="prov-details" open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
        <summary>Field provenance</summary>
        {open && <Provenance c={c} d={d} testFile={testFile} />}
      </details>
    </article>
  );
}

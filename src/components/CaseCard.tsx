import { useState } from "react";
import { formatName, type Bundle, type Case, type DescriptorReport, type Status } from "../lib/bundle";
import { VERDICT_PILL, verdictOf } from "../lib/classify";
import { render } from "../lib/decode";
import type { TestFileState } from "../lib/hooks";
import { contractUrl, isTxHash } from "../lib/links";
import type { ChainInfo } from "../lib/sourcify";
import { Parameters } from "./Parameters";
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

type Result = NonNullable<Case["results"]>[string];

/** One implementation's result. A pass starts collapsed: the screen equals the expected one. */
function ImplCard({ name, result: r }: { name: string; result: Result | undefined }) {
  const status: Status = r?.status ?? "error";
  const [open, setOpen] = useState(status !== "pass");
  const diffPaths = new Set((r?.diff ?? []).map((e) => e.path));
  return (
    <div className={`impl status-${status}${open ? "" : " collapsed"}`}>
      <button type="button" className="col-title impl-head" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="impl-name">{name}</span>
        <span className={`pill ${status}`}>{STATUS_TEXT[status]}</span>
        <span className={`impl-caret${open ? " is-open" : ""}`} aria-hidden="true">
          <svg viewBox="0 0 16 16" width="18" height="18">
            <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M4 6l4 4 4-4" />
          </svg>
        </span>
      </button>
      {open && (
        <div className="impl-body">
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
      )}
    </div>
  );
}

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
  const [open, setOpen] = useState(false);
  const input = c.input ?? { type: "unknown" };
  const chain = typeof input.chainId === "number" ? chains.get(input.chainId)?.name ?? `chain ${input.chainId}` : null;
  const toUrl = contractUrl(input.chainId, input.to);
  const value = wei(input.value);

  return (
    <article className={`case verdict-${verdict}`} id={`case-${d.entity}-${d.name}-${c.index}`}>
      <header className="case-head">
        <div className="case-title">
          <h4>
            <span className="h4-label">Test case {c.index + 1}:</span> {c.description}
          </h4>
          <span className={`pill ${VERDICT_PILL[verdict].tone}`}>{VERDICT_PILL[verdict].text}</span>
        </div>
        <dl className="case-meta small">
          <dt>Function</dt>
          <dd className="mono">{c.format ? formatName(c.format) : <span className="warn-text">no format of the descriptor matches this input</span>}</dd>
          {c.format && c.format !== formatName(c.format) && (
            <>
              <dt>Signature</dt>
              <dd className="mono signature">{c.format}</dd>
            </>
          )}
          {chain && (
            <>
              <dt>Chain</dt>
              <dd>
                {chain}
                {typeof input.chainId === "number" && <span className="muted"> (id {input.chainId})</span>}
              </dd>
            </>
          )}
          {input.to && (
            <>
              <dt>Contract</dt>
              <dd className="mono">{toUrl ? <a href={toUrl} target="_blank" rel="noreferrer">{input.to}</a> : input.to}</dd>
            </>
          )}
          {value && (
            <>
              <dt>Value</dt>
              <dd className="mono">{value}</dd>
            </>
          )}
          {c.from && (
            <>
              <dt>Signer</dt>
              <dd className="mono">{c.from}</dd>
            </>
          )}
          {isTxHash(c.txHash) && (
            <>
              <dt>Transaction</dt>
              <dd className="mono" title={c.txHash}>{c.txHash}</dd>
            </>
          )}
          {input.error && (
            <>
              <dt>Input</dt>
              <dd className="warn-text">{input.error}</dd>
            </>
          )}
        </dl>
      </header>

      <div className="case-body">
        <div className="expected">
          <div className="section-head">
            <div className="section-title">🎯 Expected output</div>
            <div className="section-sub">from the test file</div>
          </div>
          <div className="centered">
            <Screen rendered={c.expected} />
          </div>
        </div>
        <div className="compare-arrow" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="28" height="28">
            <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M4 12h15m-6-6 6 6-6 6" />
          </svg>
        </div>
        <div className="impls">
          <div className="section-head">
            <div className="section-title">⚙️ Test runner results</div>
            <div className="section-sub">what each implementation rendered</div>
          </div>
          {bundle.implementations.map((impl) => (
            <ImplCard key={impl.id} name={impl.implementation ?? impl.id} result={c.results?.[impl.id]} />
          ))}
        </div>
      </div>

      <Parameters c={c} d={d} testFile={testFile} />

      <details className="prov-details" open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
        <summary>Field provenance</summary>
        {open && <Provenance c={c} d={d} testFile={testFile} />}
      </details>
    </article>
  );
}

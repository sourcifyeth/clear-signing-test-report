import type { Bundle, RunIndexEntry } from "../lib/bundle";
import { totals } from "../lib/classify";
import { commitUrl, prUrl, runUrl } from "../lib/links";

interface Props {
  bundle: Bundle;
  index: RunIndexEntry[] | null;
  currentRun: number | null;
  failuresOnly: boolean;
  onFailuresOnly: (v: boolean) => void;
}

const utc = (v: string | null) => (v && !Number.isNaN(Date.parse(v)) ? `${new Date(v).toISOString().slice(0, 16).replace("T", " ")} UTC` : "—");

export function Header({ bundle, index, currentRun, failuresOnly, onFailuresOnly }: Props) {
  const t = totals(bundle);
  const pr = prUrl(bundle.pr.number);
  const commit = commitUrl(bundle.pr.headSha);
  const run = runUrl(bundle.run.id);
  return (
    <header className="report-head">
      <div className="eyebrow">Clear signing tests · pull request {bundle.pr.number ?? "?"}</div>
      <h1>{bundle.pr.title ?? `Pull request ${bundle.pr.number ?? ""}`}</h1>
      <div className="meta small">
        {pr && (
          <a href={pr} target="_blank" rel="noreferrer">
            pull request
          </a>
        )}
        {commit ? (
          <a href={commit} target="_blank" rel="noreferrer" className="mono">
            {bundle.pr.headSha?.slice(0, 7)}
          </a>
        ) : (
          <span className="mono">{bundle.pr.headSha ?? "?"}</span>
        )}
        {bundle.pr.headRepo && <span className="mono">{bundle.pr.headRepo}</span>}
        {run && (
          <a href={run} target="_blank" rel="noreferrer">
            run {bundle.run.id}
          </a>
        )}
        <span>started {utc(bundle.run.startedAt)}</span>
        <span>finished {utc(bundle.run.completedAt)}</span>
      </div>
      <div className="meta small">
        {bundle.implementations.map((i) => (
          <span key={i.id} className="mono" title={i.runner ?? ""}>
            {i.implementation ?? i.id}
          </span>
        ))}
        {bundle.implementations.length === 0 && <span className="warn-text">No implementation uploaded results.</span>}
      </div>
      <div className="summary">
        <span className="stat">
          <b>{bundle.descriptors.length}</b> descriptor{bundle.descriptors.length === 1 ? "" : "s"}
        </span>
        <span className="stat">
          <b>{t.cases}</b> case{t.cases === 1 ? "" : "s"}
        </span>
        <span className="stat pass">
          <b>{t.byVerdict.pass}</b> pass everywhere
        </span>
        <span className="stat warn">
          <b>{t.byVerdict.disagree}</b> disagree
        </span>
        <span className="stat fail">
          <b>{t.byVerdict["all-differ"]}</b> differ everywhere
        </span>
        {t.byVerdict.error + t.byVerdict.none > 0 && (
          <span className="stat">
            <b>{t.byVerdict.error + t.byVerdict.none}</b> error
          </span>
        )}
        <label className="toggle">
          <input id="failures-only" type="checkbox" checked={failuresOnly} onChange={(e) => onFailuresOnly(e.target.checked)} /> failures only
        </label>
        {index && index.length > 1 && (
          <label className="toggle">
            run{" "}
            <select
              id="run-picker"
              value={currentRun ?? ""}
              onChange={(e) => {
                const q = new URLSearchParams(window.location.search);
                q.set("run", e.target.value);
                window.location.search = q.toString();
              }}
            >
              {index.map((e) => (
                <option key={e.runId} value={e.runId}>
                  {e.runId} · {e.headSha?.slice(0, 7)} · {utc(e.startedAt)}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
    </header>
  );
}

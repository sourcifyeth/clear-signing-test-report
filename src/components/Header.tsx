import type { Bundle, RunIndexEntry } from "../lib/bundle";
import { totals } from "../lib/classify";
import { prUrl, runUrl } from "../lib/links";

interface Props {
  bundle: Bundle;
  index: RunIndexEntry[] | null;
  currentRun: number | null;
  failuresOnly: boolean;
  onFailuresOnly: (v: boolean) => void;
}

const utc = (v: string | null) => (v && !Number.isNaN(Date.parse(v)) ? `${new Date(v).toISOString().slice(0, 16).replace("T", " ")} UTC` : "—");

/** "1 min 15 s" between two ISO times, or null when either is missing. */
function duration(from: string | null, to: string | null): string | null {
  if (!from || !to) return null;
  const ms = Date.parse(to) - Date.parse(from);
  if (Number.isNaN(ms) || ms < 0) return null;
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h} h ${m % 60} min`;
  if (m > 0) return `${m} min ${s % 60} s`;
  return `${s} s`;
}

const ExternalIcon = () => (
  <svg className="icon" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
    <path fill="currentColor" d="M3.75 2h3.5a.75.75 0 0 1 0 1.5h-3.5a.25.25 0 0 0-.25.25v8.5c0 .138.112.25.25.25h8.5a.25.25 0 0 0 .25-.25v-3.5a.75.75 0 0 1 1.5 0v3.5A1.75 1.75 0 0 1 12.25 14h-8.5A1.75 1.75 0 0 1 2 12.25v-8.5C2 2.784 2.784 2 3.75 2Zm6.854-1h4.146a.25.25 0 0 1 .25.25v4.146a.25.25 0 0 1-.427.177L13.03 4.03 9.28 7.78a.75.75 0 0 1-1.06-1.06l3.75-3.75-1.543-1.543A.25.25 0 0 1 10.604 1Z" />
  </svg>
);

const GitHubIcon = () => (
  <svg className="icon gh" viewBox="0 0 16 16" width="20" height="20" aria-label="GitHub">
    <path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
  </svg>
);

export function Header({ bundle, index, currentRun, failuresOnly, onFailuresOnly }: Props) {
  const t = totals(bundle);
  const pr = prUrl(bundle.pr.number);
  const run = runUrl(bundle.run.id);
  const took = duration(bundle.run.startedAt, bundle.run.completedAt);
  return (
    <header className="report-head">
      <div className="eyebrow">
        Pull request {bundle.pr.number ?? "?"}
        {pr && (
          <a href={pr} target="_blank" rel="noreferrer" className="eyebrow-link" title="Open the pull request on GitHub">
            <ExternalIcon />
          </a>
        )}
      </div>
      <div className="title-row">
        {pr ? (
          <a href={pr} target="_blank" rel="noreferrer" className="gh-link" title="Open the pull request on GitHub">
            <GitHubIcon />
          </a>
        ) : (
          <GitHubIcon />
        )}
        <h1>{bundle.pr.title ?? `Pull request ${bundle.pr.number ?? ""}`}</h1>
      </div>
      <div className="meta small">
        {run ? (
          <a href={run} target="_blank" rel="noreferrer">
            run {bundle.run.id}
          </a>
        ) : (
          <span>run {bundle.run.id ?? "?"}</span>
        )}
        <span>started {utc(bundle.run.startedAt)}</span>
        <span>finished {utc(bundle.run.completedAt)}</span>
        {took && <span>took {took}</span>}
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
      <div className="totals">
        Total <b>{t.cases}</b> test case{t.cases === 1 ? "" : "s"}: <b className="pass">{t.byVerdict.pass}</b> pass everywhere,{" "}
        <b className="warn">{t.byVerdict.disagree}</b> disagree, <b className="fail">{t.byVerdict["all-differ"]}</b> fail on all runners
        {t.byVerdict.error + t.byVerdict.none > 0 && (
          <>
            , <b>{t.byVerdict.error + t.byVerdict.none}</b> with errors
          </>
        )}
      </div>
    </header>
  );
}

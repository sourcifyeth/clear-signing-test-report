import { formatName, type Bundle, type DescriptorReport } from "../lib/bundle";
import { testedFormats, verdictCounts, verdictOf } from "../lib/classify";
import { useTestFile } from "../lib/hooks";
import { fileAtSha } from "../lib/links";
import type { ChainInfo } from "../lib/sourcify";
import { CaseCard } from "./CaseCard";
import { Deployments } from "./Deployments";

interface Props {
  bundle: Bundle;
  d: DescriptorReport;
  n: number;
  chains: Map<number, ChainInfo>;
  failuresOnly: boolean;
}

export const anchorOf = (d: DescriptorReport) => `d-${d.entity}-${d.name}`;

/** The non-passing cases of a descriptor, as counts. Nothing when all pass. */
export function VerdictPills({ d, implIds, short = false }: { d: DescriptorReport; implIds: string[]; short?: boolean }) {
  const n = verdictCounts(d, implIds);
  const pills: { text: string; tone: string }[] = [];
  if (n["all-differ"] > 0) pills.push({ text: short ? `${n["all-differ"]} fail everywhere` : `${n["all-differ"]} case${n["all-differ"] === 1 ? "" : "s"} fail${n["all-differ"] === 1 ? "s" : ""} on all runners`, tone: "fail" });
  if (n.disagree > 0) pills.push({ text: short ? `${n.disagree} disagree` : `${n.disagree} case${n.disagree === 1 ? "" : "s"} disagree`, tone: "warn" });
  if (n.error + n.none > 0) pills.push({ text: `${n.error + n.none} error${n.error + n.none === 1 ? "" : "s"}`, tone: "neutral" });
  return (
    <>
      {pills.map((p) => (
        <span key={p.text} className={`pill ${p.tone}`}>
          {p.text}
        </span>
      ))}
    </>
  );
}

export function DescriptorSection({ bundle, d, n, chains, failuresOnly }: Props) {
  const implIds = bundle.implementations.map((i) => i.id);
  const testFile = useTestFile(bundle.pr.headRepo, bundle.pr.headSha, d);
  const link = fileAtSha(bundle.pr.headRepo, bundle.pr.headSha, d.path);
  const cov = testedFormats(d);
  const cases = (d.cases ?? []).filter((c) => !failuresOnly || verdictOf(c, implIds) !== "pass");
  const hidden = (d.cases ?? []).length - cases.length;

  return (
    <section className="descriptor" id={anchorOf(d)}>
      <header className="descriptor-head">
        <h3>
          <span className="h3-label">Descriptor file {n}:</span> {d.entity}/{d.name}
          <VerdictPills d={d} implIds={implIds} />
        </h3>
        <div className="small muted">
          <span className={`pill ${d.change?.descriptor === "unchanged" ? "neutral" : "info"}`}>descriptor {d.change?.descriptor ?? "?"}</span>{" "}
          <span className={`pill ${d.change?.tests === "unchanged" ? "neutral" : "info"}`}>tests {d.change?.tests ?? "?"}</span>{" "}
          {link && (
            <a href={link} target="_blank" rel="noreferrer">
              descriptor at {bundle.pr.headSha?.slice(0, 7)}
            </a>
          )}
        </div>
      </header>

      <div className="descriptor-grid">
        <div>
          <div className="col-title">Deployments</div>
          <Deployments d={d} chains={chains} />
        </div>
        <div>
          <div className="col-title">
            Functions tested {cov.tested} / {cov.total}
          </div>
          <ul className="formats">
            {Object.entries(d.formats ?? {}).map(([key, f]) => (
              <li key={key} className={f.cases.length === 0 ? "untested" : ""}>
                <span className="mono small" title={key}>
                  {formatName(key)}
                </span>
                {f.error ? (
                  <span className="warn-text small"> {f.error}</span>
                ) : f.cases.length === 0 ? (
                  <span className="pill fail">no test</span>
                ) : (
                  <span className="muted small">
                    {" "}
                    {f.cases.length} case{f.cases.length === 1 ? "" : "s"}
                  </span>
                )}
              </li>
            ))}
          </ul>
          {d.recommendations?.length > 0 && (
            <div className="small muted recs">
              {d.recommendations.map((r, i) => (
                <div key={i}>
                  {r.type === "no-interpolated-intent"
                    ? `${formatName(String(r.format))}: no interpolatedIntent`
                    : r.type === "deprecated-key"
                      ? `uses the deprecated key ${String(r.key)}`
                      : r.type}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="cases">
        {cases.map((c) => (
          <CaseCard key={c.index} bundle={bundle} d={d} c={c} chains={chains} testFile={testFile} />
        ))}
        {hidden > 0 && (
          <p className="muted small">
            {hidden} passing case{hidden === 1 ? "" : "s"} hidden.
          </p>
        )}
        {(d.cases ?? []).length === 0 && <p className="muted small">The test file has no case.</p>}
      </div>
    </section>
  );
}

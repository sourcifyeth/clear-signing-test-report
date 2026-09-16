import { formatName, type Bundle, type DescriptorReport } from "../lib/bundle";
import { descriptorHasDisagreement, testedFormats, verdictOf } from "../lib/classify";
import { useTestFile } from "../lib/hooks";
import { fileAtSha } from "../lib/links";
import type { ChainInfo } from "../lib/sourcify";
import { CaseCard } from "./CaseCard";
import { Deployments } from "./Deployments";

interface Props {
  bundle: Bundle;
  d: DescriptorReport;
  chains: Map<number, ChainInfo>;
  failuresOnly: boolean;
}

export const anchorOf = (d: DescriptorReport) => `d-${d.entity}-${d.name}`;

export function DescriptorSection({ bundle, d, chains, failuresOnly }: Props) {
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
          {d.entity}/{d.name}
          {descriptorHasDisagreement(d, implIds) && <span className="pill warn">implementations disagree</span>}
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

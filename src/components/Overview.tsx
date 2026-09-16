import type { Bundle } from "../lib/bundle";
import { countsFor, descriptorHasDisagreement, testedFormats } from "../lib/classify";
import { fileAtSha } from "../lib/links";
import { anchorOf } from "./DescriptorSection";
import { DeploymentsSummary } from "./Deployments";

export function Overview({ bundle }: { bundle: Bundle }) {
  const implIds = bundle.implementations.map((i) => i.id);
  return (
    <section className="overview" id="overview">
      <h2>Overview</h2>
      {bundle.missingTests.length > 0 && (
        <div className="callout fail">
          <strong>
            {bundle.missingTests.length} descriptor{bundle.missingTests.length === 1 ? " has" : "s have"} no test file:
          </strong>{" "}
          {bundle.missingTests.map((p, i) => (
            <span key={i} className="mono small">
              {i > 0 && ", "}
              {p}
            </span>
          ))}
        </div>
      )}
      <div className="tablewrap">
        <table className="overview-table">
          <thead>
            <tr>
              <th>Descriptor</th>
              <th>Change</th>
              <th>Functions tested</th>
              {bundle.implementations.map((i) => (
                <th key={i.id} title={i.implementation ?? i.id}>
                  {i.id.replace(/-clear-signing$/, "")}
                </th>
              ))}
              <th>Deployments</th>
            </tr>
          </thead>
          <tbody>
            {bundle.descriptors.map((d) => {
              const cov = testedFormats(d);
              const link = fileAtSha(bundle.pr.headRepo, bundle.pr.headSha, d.path);
              return (
                <tr key={d.path}>
                  <td>
                    <a href={`#${anchorOf(d)}`}>
                      {d.entity}/{d.name}
                    </a>
                    {link && (
                      <a className="small muted src" href={link} target="_blank" rel="noreferrer">
                        source
                      </a>
                    )}
                    {descriptorHasDisagreement(d, implIds) && <span className="pill warn">disagree</span>}
                  </td>
                  <td>
                    <span className={`pill ${d.change?.descriptor === "unchanged" ? "neutral" : "info"}`}>{d.change?.descriptor ?? "?"}</span>{" "}
                    {d.change?.tests && d.change.tests !== "unchanged" && <span className="pill info">tests {d.change.tests}</span>}
                  </td>
                  <td className={`num ${cov.tested < cov.total ? "warn-text" : ""}`}>
                    {cov.tested} / {cov.total}
                  </td>
                  {bundle.implementations.map((i) => {
                    const n = countsFor(d, i.id);
                    return (
                      <td key={i.id} className="num counts">
                        {n.pass > 0 && (
                          <span className="count pass">
                            <i /> {n.pass}
                          </span>
                        )}
                        {n.fail > 0 && (
                          <span className="count fail">
                            <i /> {n.fail}
                          </span>
                        )}
                        {n.error + n.skipped + n.missing > 0 && (
                          <span className="count error">
                            <i /> {n.error + n.skipped + n.missing}
                          </span>
                        )}
                      </td>
                    );
                  })}
                  <td>
                    <DeploymentsSummary d={d} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="legend small muted">
        <span className="count pass">
          <i /> pass
        </span>
        <span className="count fail">
          <i /> fail
        </span>
        <span className="count error">
          <i /> error, skipped or missing
        </span>
      </p>
    </section>
  );
}

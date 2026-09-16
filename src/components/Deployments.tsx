import type { Deployment, DescriptorReport } from "../lib/bundle";
import { useDeployment } from "../lib/hooks";
import { contractUrl } from "../lib/links";
import type { ChainInfo } from "../lib/sourcify";

export function deploymentsOf(d: DescriptorReport): Deployment[] {
  const list = d.kind === "eip712" ? d.head?.context?.eip712?.deployments : d.head?.context?.contract?.deployments;
  return (Array.isArray(list) ? list : []).filter((x) => x && typeof x === "object" && typeof x.chainId === "number" && typeof x.address === "string");
}

function DeploymentRow({ d, dep, chains }: { d: DescriptorReport; dep: Deployment; chains: Map<number, ChainInfo> }) {
  const info = useDeployment(dep.chainId, dep.address);
  const url = contractUrl(dep.chainId, dep.address);
  const selectors = Object.values(d.formats ?? {}).map((f) => f.selector).filter((s): s is string => typeof s === "string");
  const present = info.selectors ? selectors.filter((s) => info.selectors!.has(s)).length : null;
  let abi: string | null = null;
  if (d.kind === "calldata" && info.status === "verified") {
    abi = info.selectors === null ? "ABI not readable" : `${present} of ${selectors.length} functions in ABI`;
  }
  const abiBad = d.kind === "calldata" && info.status === "verified" && info.selectors !== null && present !== selectors.length;
  return (
    <li className="deployment">
      <span className="mono small">{chains.get(dep.chainId)?.name ?? `chain ${dep.chainId}`}</span>
      {url ? (
        <a className="mono small" href={url} target="_blank" rel="noreferrer">
          {dep.address}
        </a>
      ) : (
        <span className="mono small">{dep.address}</span>
      )}
      <span className={`pill ${info.status === "verified" ? (abiBad ? "warn" : "pass") : info.status === "unverified" ? "fail" : "neutral"}`}>
        {info.status === "checking" ? "checking…" : info.status === "error" ? "lookup failed" : info.status}
      </span>
      {info.isProxy && (
        <span className="small muted">
          {info.proxyType ?? "proxy"} → {info.implementations.length} implementation{info.implementations.length === 1 ? "" : "s"}
          {info.implementations.some((i) => i.abi === "unverified") && ", some unverified"}
        </span>
      )}
      {abi && <span className={`small ${abiBad ? "warn-text" : "muted"}`}>{abi}</span>}
    </li>
  );
}

export function Deployments({ d, chains }: { d: DescriptorReport; chains: Map<number, ChainInfo> }) {
  const deps = deploymentsOf(d);
  if (deps.length === 0) return <p className="muted small">The descriptor lists no deployment.</p>;
  return (
    <ul className="deployments">
      {deps.map((dep, i) => (
        <DeploymentRow key={i} d={d} dep={dep} chains={chains} />
      ))}
    </ul>
  );
}

/** One word for the overview: the worst deployment status of a descriptor. */
export function DeploymentsSummary({ d }: { d: DescriptorReport }) {
  const deps = deploymentsOf(d);
  const first = deps[0];
  const info = useDeployment(first?.chainId, first?.address);
  if (deps.length === 0) return <span className="muted small">none</span>;
  const selectors = Object.values(d.formats ?? {}).map((f) => f.selector).filter((s): s is string => typeof s === "string");
  const present = info.selectors ? selectors.filter((s) => info.selectors!.has(s)).length : null;
  const abiBad = d.kind === "calldata" && info.status === "verified" && present !== null && present !== selectors.length;
  const text =
    info.status === "checking" ? "checking…" : info.status === "verified" ? (abiBad ? `ABI ${present}/${selectors.length}` : "verified") : info.status === "unverified" ? "unverified" : "lookup failed";
  return (
    <span className={`pill ${info.status === "verified" ? (abiBad ? "warn" : "pass") : info.status === "unverified" ? "fail" : "neutral"}`}>
      {text}
      {deps.length > 1 ? ` +${deps.length - 1}` : ""}
    </span>
  );
}

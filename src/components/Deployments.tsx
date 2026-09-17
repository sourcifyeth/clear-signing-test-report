import { useState } from "react";
import { formatName, type Deployment, type DescriptorReport } from "../lib/bundle";
import { useDeployment } from "../lib/hooks";
import { contractUrl } from "../lib/links";
import type { ChainInfo, DeploymentInfo } from "../lib/sourcify";

export function deploymentsOf(d: DescriptorReport): Deployment[] {
  const list = d.kind === "eip712" ? d.head?.context?.eip712?.deployments : d.head?.context?.contract?.deployments;
  return (Array.isArray(list) ? list : []).filter((x) => x && typeof x === "object" && typeof x.chainId === "number" && typeof x.address === "string");
}

/**
 * What the Sourcify lookup says about one deployment, as one of a few
 * verdicts. The distinction that matters: a function that is absent from a
 * fully verified ABI is a real mismatch, while a function that cannot be
 * found because some implementations are unverified is an open question,
 * and those implementations must be verified.
 */
export type AbiVerdict =
  | { kind: "checking" }
  | { kind: "lookup-failed" }
  | { kind: "unverified" }
  | { kind: "invalid-address"; note: string }
  | { kind: "verified" } // EIP-712, or a calldata descriptor with no function to check
  | { kind: "ok"; found: number; total: number }
  | { kind: "missing"; found: number; total: number; missing: string[] }
  | { kind: "impls-unverified"; found: number; total: number; missing: string[]; unverified: string[]; implementations: number };

export function abiVerdict(d: DescriptorReport, info: DeploymentInfo): AbiVerdict {
  if (info.status === "checking") return { kind: "checking" };
  if (info.status === "error") return { kind: "lookup-failed" };
  if (info.status === "unverified") return { kind: "unverified" };
  if (info.status === "invalid-address") return { kind: "invalid-address", note: info.note ?? "invalid address" };
  if (d.kind !== "calldata") return { kind: "verified" };

  const formats: [string, string][] = [];
  for (const [key, f] of Object.entries(d.formats ?? {})) {
    if (typeof f?.selector === "string") formats.push([key, f.selector]);
  }
  if (formats.length === 0) return { kind: "verified" };
  const total = formats.length;
  const selectors = info.selectors;
  const missing = (selectors ? formats.filter(([, sel]) => !selectors.has(sel)) : formats).map(([key]) => formatName(key));
  const found = total - missing.length;
  if (missing.length === 0) return { kind: "ok", found, total };

  const unverified = info.implementations.filter((i) => i.abi !== "verified").map((i) => i.address);
  if (info.isProxy && unverified.length > 0) {
    return { kind: "impls-unverified", found, total, missing, unverified, implementations: info.implementations.length };
  }
  return { kind: "missing", found, total, missing };
}

/** The pill text and colour of a verdict. */
export function verdictPill(v: AbiVerdict): { text: string; tone: "pass" | "warn" | "fail" | "neutral"; logo?: boolean } {
  switch (v.kind) {
    case "checking":
      return { text: "checking…", tone: "neutral" };
    case "lookup-failed":
      return { text: "lookup failed", tone: "neutral" };
    case "unverified":
      return { text: "unverified", tone: "fail" };
    case "invalid-address":
      return { text: "invalid address", tone: "fail" };
    case "verified":
    case "ok":
      return { text: "verified", tone: "pass", logo: true };
    case "missing":
      return { text: `${v.missing.length} of ${v.total} functions not in ABI`, tone: "fail" };
    case "impls-unverified":
      return { text: `${v.unverified.length} of ${v.implementations} implementation${v.implementations === 1 ? "" : "s"} unverified`, tone: "fail" };
  }
}

/** The verdict as a pill; a Sourcify-verified one carries the Sourcify logo. */
function VerdictPill({ pill, suffix, title }: { pill: ReturnType<typeof verdictPill>; suffix?: string; title?: string }) {
  return (
    <span className={`pill ${pill.tone}`} title={title}>
      {pill.logo && <img className="pill-logo" src={`${import.meta.env.BASE_URL}sourcify.png`} alt="Sourcify" />}
      {pill.text}
      {suffix ?? ""}
    </span>
  );
}

function DeploymentRow({ d, dep, chains }: { d: DescriptorReport; dep: Deployment; chains: Map<number, ChainInfo> }) {
  const info = useDeployment(dep.chainId, dep.address);
  const url = contractUrl(dep.chainId, dep.address);
  const v = abiVerdict(d, info);
  const pill = verdictPill(v);
  const [showUnverified, setShowUnverified] = useState(false);
  return (
    <li className="deployment">
      <div className="deployment-line">
        <span className="mono small">{chains.get(dep.chainId)?.name ?? `chain ${dep.chainId}`}</span>
        {url ? (
          <a className="mono small" href={url} target="_blank" rel="noreferrer">
            {dep.address}
          </a>
        ) : (
          <span className="mono small">{dep.address}</span>
        )}
        <VerdictPill pill={pill} />
      </div>
      {info.isProxy && (
        <div className="small muted">
          {info.proxyType ?? "proxy"} → {info.implementations.length} implementation{info.implementations.length === 1 ? "" : "s"}
          {v.kind === "impls-unverified" ? `, ${v.unverified.length} unverified` : info.implementations.length > 0 ? ", all verified" : ""}
        </div>
      )}
      {v.kind === "invalid-address" && <div className="small fail-text">Invalid address in the descriptor: {v.note}.</div>}
      {v.kind === "ok" && (
        <div className="small muted">
          {v.found} of {v.total} functions in the verified ABI
        </div>
      )}
      {v.kind === "missing" && (
        <div className="small fail-text">
          {v.missing.length} of {v.total} functions are not in the verified ABI: <span className="mono">{v.missing.join(", ")}</span>. The descriptor formats functions this contract does not have.
        </div>
      )}
      {v.kind === "impls-unverified" && (
        <div className="small fail-text">
          {v.missing.length} of {v.total} functions were not found, and {v.unverified.length} of {v.implementations} implementation{v.implementations === 1 ? " is" : "s are"} unverified on
          Sourcify, so the ABI cannot be checked. The implementation{v.unverified.length === 1 ? "" : "s"} must be verified.{" "}
          <button type="button" className="linklike" onClick={() => setShowUnverified((s) => !s)}>
            {showUnverified ? "hide the addresses" : "show the addresses"}
          </button>
          {showUnverified && (
            <ul className="mono small addr-list">
              {v.unverified.map((a) => {
                const u = contractUrl(dep.chainId, a);
                return (
                  <li key={a}>
                    {u ? (
                      <a href={u} target="_blank" rel="noreferrer">
                        {a}
                      </a>
                    ) : (
                      a
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
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

/** One pill for the overview: the verdict of the first deployment, and how many more there are. */
export function DeploymentsSummary({ d }: { d: DescriptorReport }) {
  const deps = deploymentsOf(d);
  const first = deps[0];
  const info = useDeployment(first?.chainId, first?.address);
  if (deps.length === 0) return <span className="muted small">none</span>;
  const pill = verdictPill(abiVerdict(d, info));
  return <VerdictPill pill={pill} suffix={deps.length > 1 ? ` +${deps.length - 1}` : ""} title={deps.length > 1 ? `first of ${deps.length} deployments` : undefined} />;
}

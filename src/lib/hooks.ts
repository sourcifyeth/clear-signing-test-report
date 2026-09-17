import { useEffect, useState } from "react";
import type { DescriptorReport } from "./bundle";
import { rawAtSha } from "./links";
import { chains, deployment, type ChainInfo, type DeploymentInfo } from "./sourcify";
import { functionDocs, type FunctionDocs } from "./natspec";
import type { TestFileCase } from "./decode";

export function useChains(): Map<number, ChainInfo> {
  const [map, setMap] = useState<Map<number, ChainInfo>>(new Map());
  useEffect(() => {
    let live = true;
    chains().then((m) => live && setMap(m));
    return () => {
      live = false;
    };
  }, []);
  return map;
}

export function useDeployment(chainId: unknown, address: unknown): DeploymentInfo {
  const [info, setInfo] = useState<DeploymentInfo>({ status: "checking", match: null, isProxy: false, proxyType: null, implementations: [], selectors: null });
  useEffect(() => {
    let live = true;
    deployment(chainId, address).then((i) => live && setInfo(i));
    return () => {
      live = false;
    };
  }, [chainId, address]);
  return info;
}

export interface TestFileState {
  status: "idle" | "loading" | "ready" | "error";
  cases: Map<string, TestFileCase>;
  message: string | null;
}

const testFileCache = new Map<string, Promise<Map<string, TestFileCase>>>();

/** The test file of a descriptor at the head commit, keyed by description. */
export function useTestFile(headRepo: string | null, headSha: string | null, d: DescriptorReport): TestFileState {
  const url = d.testFile ? rawAtSha(headRepo, headSha, d.testFile) : null;
  const [state, setState] = useState<TestFileState>({ status: url ? "loading" : "idle", cases: new Map(), message: url ? null : "No test file URL can be built from this bundle." });
  useEffect(() => {
    if (!url) return;
    let live = true;
    let p = testFileCache.get(url);
    if (!p) {
      p = fetch(url)
        .then((r) => {
          if (!r.ok) throw new Error(`${r.status} for the test file`);
          return r.json();
        })
        .then((doc: { tests?: TestFileCase[] }) => {
          const map = new Map<string, TestFileCase>();
          for (const t of Array.isArray(doc?.tests) ? doc.tests : []) {
            if (t && typeof t === "object" && typeof t.description === "string") map.set(t.description, t);
          }
          return map;
        });
      testFileCache.set(url, p);
    }
    p.then(
      (cases) => live && setState({ status: "ready", cases, message: null }),
      (e: Error) => live && setState({ status: "error", cases: new Map(), message: e.message }),
    );
    return () => {
      live = false;
    };
  }, [url]);
  return state;
}

const NO_DOCS: FunctionDocs = { source: "none", notice: null, details: null, params: {} };

/** The NatSpec of a function on a contract, from Sourcify. Empty until it arrives, and when there is none. */
export function useFunctionDocs(chainId: unknown, address: unknown, format: string | null): FunctionDocs {
  const [docs, setDocs] = useState<FunctionDocs>(NO_DOCS);
  useEffect(() => {
    let live = true;
    functionDocs(chainId, address, format).then((d) => live && setDocs(d));
    return () => {
      live = false;
    };
  }, [chainId, address, format]);
  return docs;
}

import { useEffect, useState } from "react";
import { chains, deployment, type ChainInfo, type DeploymentInfo } from "./sourcify";

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

const CHECKING: DeploymentInfo = { status: "checking", match: null, isProxy: false, proxyType: null, implementations: [], selectors: null };

export function useDeployment(chainId: unknown, address: unknown): DeploymentInfo {
  const [info, setInfo] = useState<DeploymentInfo>(CHECKING);
  useEffect(() => {
    let live = true;
    deployment(chainId, address).then((i) => live && setInfo(i));
    return () => {
      live = false;
    };
  }, [chainId, address]);
  return info;
}

/** The lookups of several deployments, in the order given. Each one is "checking" until it arrives. */
export function useDeployments(list: { chainId: unknown; address: unknown }[]): DeploymentInfo[] {
  const key = list.map((d) => `${d.chainId}:${d.address}`).join("|");
  const [infos, setInfos] = useState<DeploymentInfo[]>(() => list.map(() => CHECKING));
  useEffect(() => {
    let live = true;
    setInfos(list.map(() => CHECKING));
    list.forEach((d, i) =>
      deployment(d.chainId, d.address).then((info) => {
        if (!live) return;
        setInfos((prev) => {
          const next = prev.slice();
          next[i] = info;
          return next;
        });
      }),
    );
    return () => {
      live = false;
    };
  }, [key]);
  return infos;
}

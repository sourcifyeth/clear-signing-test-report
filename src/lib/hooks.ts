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

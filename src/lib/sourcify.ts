/**
 * Read-only lookups on the public Sourcify API. Responses observed on
 * 2026-09-16:
 *
 *   GET /chains → [{ name, chainId, rpc, traceSupportedRPCs, supported, etherscanAPI }]
 *     (no nativeCurrency, so the viewer cannot name the native token)
 *   GET /v2/contract/{chain}/{address}?fields=proxyResolution
 *     200 → { proxyResolution: { isProxy, proxyType, implementations: [{ address, name? }] },
 *             match, creationMatch, runtimeMatch, verifiedAt, chainId, address }
 *     404 → { match: null, ... }   the contract is not verified
 *   GET /v2/contract/{chain}/{address}?fields=abi → { abi: [...] }
 *   CORS: access-control-allow-origin: *
 */
import { toFunctionSelector, type AbiFunction } from "viem";
import { isAddress, isChainId } from "./links";

const BASE = "https://sourcify.dev/server";

export interface ChainInfo {
  name: string;
  chainId: number;
}

let chainsPromise: Promise<Map<number, ChainInfo>> | null = null;

export function chains(): Promise<Map<number, ChainInfo>> {
  if (!chainsPromise) {
    chainsPromise = fetch(`${BASE}/chains`)
      .then((r) => (r.ok ? r.json() : []))
      .then((list: unknown) => {
        const map = new Map<number, ChainInfo>();
        if (Array.isArray(list)) {
          for (const c of list) {
            if (c && typeof c === "object" && typeof c.chainId === "number" && typeof c.name === "string") {
              map.set(c.chainId, { name: c.name, chainId: c.chainId });
            }
          }
        }
        return map;
      })
      .catch(() => new Map());
  }
  return chainsPromise;
}

export interface Implementation {
  address: string;
  name: string | null;
  abi: "verified" | "unverified" | "error";
}

export interface DeploymentInfo {
  status: "checking" | "verified" | "unverified" | "error";
  match: string | null;
  isProxy: boolean;
  proxyType: string | null;
  implementations: Implementation[];
  /** Function selectors found in the ABI of the contract or its implementations. Null when no ABI was read. */
  selectors: Set<string> | null;
}

const cache = new Map<string, Promise<DeploymentInfo>>();

async function json(url: string): Promise<{ status: number; body: unknown }> {
  const r = await fetch(url);
  let body: unknown = null;
  try {
    body = await r.json();
  } catch {
    body = null;
  }
  return { status: r.status, body };
}

function selectorsOf(abi: unknown, into: Set<string>) {
  if (!Array.isArray(abi)) return;
  for (const item of abi) {
    if (item && typeof item === "object" && item.type === "function") {
      try {
        into.add(toFunctionSelector(item as AbiFunction));
      } catch {
        // an item viem cannot hash is skipped
      }
    }
  }
}

/** Looks a deployment up once; later calls share the promise. */
export function deployment(chainId: unknown, address: unknown): Promise<DeploymentInfo> {
  const error: DeploymentInfo = { status: "error", match: null, isProxy: false, proxyType: null, implementations: [], selectors: null };
  if (!isChainId(chainId) || !isAddress(address)) return Promise.resolve(error);
  const key = `${chainId}:${address.toLowerCase()}`;
  let p: Promise<DeploymentInfo> | undefined = cache.get(key);
  if (!p) {
    p = (async (): Promise<DeploymentInfo> => {
      const { status, body } = await json(`${BASE}/v2/contract/${chainId}/${address}?fields=proxyResolution`);
      if (status === 404) return { ...error, status: "unverified" as const };
      if (status !== 200 || !body || typeof body !== "object") return error;
      const b = body as { match?: string; proxyResolution?: { isProxy?: boolean; proxyType?: string | null; implementations?: { address?: string; name?: string }[] } };
      const pr = b.proxyResolution ?? {};
      const impls = (Array.isArray(pr.implementations) ? pr.implementations : [])
        .filter((i) => isAddress(i?.address))
        .slice(0, 40)
        .map((i): Implementation => ({ address: i.address as string, name: typeof i.name === "string" ? i.name : null, abi: "error" }));
      const targets = pr.isProxy && impls.length > 0 ? impls.map((i) => i.address) : [address];
      const selectors = new Set<string>();
      let read = 0;
      await Promise.all(
        targets.map(async (t, i) => {
          const r = await json(`${BASE}/v2/contract/${chainId}/${t}?fields=abi`);
          const ok = r.status === 200 && !!r.body && typeof r.body === "object" && Array.isArray((r.body as { abi?: unknown }).abi);
          if (ok) {
            read++;
            selectorsOf((r.body as { abi: unknown }).abi, selectors);
          }
          if (pr.isProxy && impls[i]) impls[i].abi = r.status === 404 ? "unverified" : ok ? "verified" : "error";
        }),
      );
      return {
        status: "verified" as const,
        match: typeof b.match === "string" ? b.match : null,
        isProxy: pr.isProxy === true,
        proxyType: typeof pr.proxyType === "string" ? pr.proxyType : null,
        implementations: impls,
        selectors: read > 0 ? selectors : null,
      };
    })().catch(() => error);
    cache.set(key, p);
  }
  return p as Promise<DeploymentInfo>;
}

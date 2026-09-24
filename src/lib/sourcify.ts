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
import { getAddress, isAddress as isChecksummedAddress, toFunctionSelector, type AbiFunction } from "viem";
import { isAddress, isChainId } from "./links";

const BASE = "https://sourcify.dev/server";

export interface ChainInfo {
  name: string;
  chainId: number;
}

let chainsPromise: Promise<Map<number, ChainInfo>> | null = null;

export function chains(): Promise<Map<number, ChainInfo>> {
  if (!chainsPromise) {
    chainsPromise = json(`${BASE}/chains`)
      .then(({ status, body: list }) => {
        const map = new Map<number, ChainInfo>();
        if (status === 200 && Array.isArray(list)) {
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
  status: "checking" | "verified" | "unverified" | "invalid-address" | "error";
  /** For "invalid-address": what is wrong with it. */
  note?: string;
  match: string | null;
  isProxy: boolean;
  proxyType: string | null;
  implementations: Implementation[];
  /** Function selectors found in the ABI of the contract or its implementations. Null when no ABI was read. */
  selectors: Set<string> | null;
}

const cache = new Map<string, Promise<DeploymentInfo>>();

/*
 * Every Sourcify request of the page goes through one queue. A large pull
 * request lists many deployments, and the page used to send them all at
 * once: a pull request with 66 descriptors sent 224 requests, and 140 failed.
 * The server rate-limits such a burst, and its 429 answer has no CORS
 * header, so the browser reports a network error. At most MAX_IN_FLIGHT
 * requests run at a time; a failed one is tried once more after a short
 * wait; the same URL in flight is fetched once.
 */
const MAX_IN_FLIGHT = 6;
let inFlight = 0;
const waiting: (() => void)[] = [];
const inFlightByUrl = new Map<string, Promise<{ status: number; body: unknown }>>();

/** Runs `task` when a slot is free. A finished task hands its slot to the next one. */
async function inSlot<T>(task: () => Promise<T>): Promise<T> {
  if (inFlight < MAX_IN_FLIGHT) inFlight++;
  else await new Promise<void>((resolve) => waiting.push(resolve));
  try {
    return await task();
  } finally {
    const next = waiting.shift();
    if (next) next();
    else inFlight--;
  }
}

async function fetchOnce(url: string): Promise<{ status: number; body: unknown }> {
  const r = await fetch(url);
  let body: unknown = null;
  try {
    body = await r.json();
  } catch {
    body = null;
  }
  return { status: r.status, body };
}

const retryable = (status: number) => status === 429 || status >= 500;
const pause = () => new Promise<void>((resolve) => setTimeout(resolve, 1000 + Math.random() * 1000));

/** GET a Sourcify URL through the queue, with one retry. Throws when the retry throws too. */
export function json(url: string): Promise<{ status: number; body: unknown }> {
  let p = inFlightByUrl.get(url);
  if (!p) {
    p = (async () => {
      try {
        const first = await inSlot(() => fetchOnce(url));
        if (!retryable(first.status)) return first;
      } catch {
        // a network error, or a 429 without CORS headers: try once more below
      }
      // The wait is outside the slot, so that other requests can run.
      await pause();
      return inSlot(() => fetchOnce(url));
    })().finally(() => inFlightByUrl.delete(url));
    inFlightByUrl.set(url, p);
  }
  return p;
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
      // A mixed-case address must carry a valid EIP-55 checksum. Sourcify
      // rejects a wrong one with 400, and so does every careful wallet.
      if (!isChecksummedAddress(address, { strict: true })) {
        let expected = "";
        try {
          expected = getAddress(address.toLowerCase());
        } catch {
          // not even a hex address; the pattern check above should have caught it
        }
        return { ...error, status: "invalid-address" as const, note: `wrong EIP-55 checksum${expected ? `, the checksummed form is ${expected}` : ""}` };
      }
      const { status, body } = await json(`${BASE}/v2/contract/${chainId}/${address}?fields=proxyResolution`);
      if (status === 404) return { ...error, status: "unverified" as const };
      if (status === 400) return { ...error, status: "invalid-address" as const, note: "Sourcify rejects this address" };
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

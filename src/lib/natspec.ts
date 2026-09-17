/**
 * NatSpec of a function, from the verified source on Sourcify.
 *
 *   GET /v2/contract/{chain}/{address}?fields=devdoc  → { devdoc: { methods: { "name(type,…)": { details?, params?: {name: text}, returns? } } } }
 *   GET /v2/contract/{chain}/{address}?fields=userdoc → { userdoc: { methods: { "name(type,…)": { notice? } } } }
 *
 * The methods are keyed by the canonical signature, without parameter names.
 * For a proxy the docs live on the implementations, so the lookup follows
 * the proxy resolution and takes the first implementation that documents
 * the function. Unverified contracts have no docs, and that is reported as
 * "none", not as an error.
 */

import { parseAbiItem, toFunctionSignature, type AbiFunction } from "viem";
import { deployment } from "./sourcify";
import { isAddress, isChainId } from "./links";

const BASE = "https://sourcify.dev/server";

export interface FunctionDocs {
  /** Where the docs came from: "none" when no verified source documents the function. */
  source: "none" | "verified";
  /** @notice of the function, for the end user. */
  notice: string | null;
  /** @dev of the function. */
  details: string | null;
  /** @param texts by parameter name. */
  params: Record<string, string>;
}

const NONE: FunctionDocs = { source: "none", notice: null, details: null, params: {} };

interface Docs {
  dev: Record<string, { details?: unknown; params?: unknown }>;
  user: Record<string, { notice?: unknown }>;
}

const docsCache = new Map<string, Promise<Docs | null>>();

/** The devdoc and userdoc methods of one verified contract, or null. */
function contractDocs(chainId: number, address: string): Promise<Docs | null> {
  const key = `${chainId}:${address.toLowerCase()}`;
  let p = docsCache.get(key);
  if (!p) {
    p = (async () => {
      const get = async (field: "devdoc" | "userdoc") => {
        const r = await fetch(`${BASE}/v2/contract/${chainId}/${address}?fields=${field}`);
        if (!r.ok) return null;
        const body = (await r.json()) as Record<string, { methods?: unknown }>;
        const methods = body?.[field]?.methods;
        return methods && typeof methods === "object" ? (methods as Record<string, never>) : null;
      };
      const [dev, user] = await Promise.all([get("devdoc"), get("userdoc")]);
      if (!dev && !user) return null;
      return { dev: dev ?? {}, user: user ?? {} };
    })().catch(() => null);
    docsCache.set(key, p);
  }
  return p;
}

/** The canonical signature of a format key, e.g. "redeemAmount(uint256,string,address)". */
export function canonicalSignature(format: string): string | null {
  try {
    return toFunctionSignature(parseAbiItem(`function ${format}`) as AbiFunction);
  } catch {
    return null;
  }
}

const fnCache = new Map<string, Promise<FunctionDocs>>();

/** The NatSpec of `format` on the contract at `address`, following a proxy to its implementations. */
export function functionDocs(chainId: unknown, address: unknown, format: string | null): Promise<FunctionDocs> {
  if (!isChainId(chainId) || !isAddress(address) || !format) return Promise.resolve(NONE);
  const sig = canonicalSignature(format);
  if (!sig) return Promise.resolve(NONE);
  const key = `${chainId}:${address.toLowerCase()}:${sig}`;
  let p = fnCache.get(key);
  if (!p) {
    p = (async (): Promise<FunctionDocs> => {
      const info = await deployment(chainId, address);
      if (info.status !== "verified") return NONE;
      const targets = info.isProxy && info.implementations.length > 0 ? info.implementations.filter((i) => i.abi === "verified").map((i) => i.address) : [address];
      for (const t of targets) {
        const docs = await contractDocs(chainId, t);
        if (!docs) continue;
        const dev = docs.dev[sig];
        const user = docs.user[sig];
        if (!dev && !user) continue;
        const params: Record<string, string> = {};
        if (dev?.params && typeof dev.params === "object") {
          for (const [k, v] of Object.entries(dev.params as Record<string, unknown>)) if (typeof v === "string") params[k] = v;
        }
        return {
          source: "verified",
          notice: typeof user?.notice === "string" ? user.notice : null,
          details: typeof dev?.details === "string" ? dev.details : null,
          params,
        };
      }
      return NONE;
    })().catch(() => NONE);
    fnCache.set(key, p);
  }
  return p;
}

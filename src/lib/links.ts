/**
 * Links are built only from values that match a strict pattern, because the
 * bundle content comes from a pull request.
 */

const REGISTRY = "ethereum/clear-signing-erc7730-registry";

export const isRepoPath = (p: unknown): p is string =>
  typeof p === "string" && /^registry\/[\w.-]+\/(testsv2\/)?[\w.-]+\.json$/.test(p);
export const isRepoSlug = (s: unknown): s is string => typeof s === "string" && /^[\w.-]+\/[\w.-]+$/.test(s);
export const isSha = (s: unknown): s is string => typeof s === "string" && /^[0-9a-f]{40}$/.test(s);
export const isAddress = (a: unknown): a is string => typeof a === "string" && /^0x[0-9a-fA-F]{40}$/.test(a);
export const isTxHash = (h: unknown): h is string => typeof h === "string" && /^0x[0-9a-fA-F]{64}$/.test(h);
export const isChainId = (c: unknown): c is number => typeof c === "number" && Number.isInteger(c) && c > 0;
export const isHttpsUrl = (u: unknown): u is string => {
  if (typeof u !== "string") return false;
  try {
    return new URL(u).protocol === "https:";
  } catch {
    return false;
  }
};

/** The GitHub URL of a file at a commit, or null. */
export function fileAtSha(repo: string | null, sha: string | null, path: string): string | null {
  if (!isRepoSlug(repo) || !isSha(sha) || !isRepoPath(path)) return null;
  return `https://github.com/${repo}/blob/${sha}/${path}`;
}

/** The raw URL of a file at a commit, or null. */
export function rawAtSha(repo: string | null, sha: string | null, path: string): string | null {
  if (!isRepoSlug(repo) || !isSha(sha) || !isRepoPath(path)) return null;
  return `https://raw.githubusercontent.com/${repo}/${sha}/${path}`;
}

export function commitUrl(sha: string | null): string | null {
  return isSha(sha) ? `https://github.com/${REGISTRY}/commit/${sha}` : null;
}

export function prUrl(n: number | null): string | null {
  return typeof n === "number" && Number.isInteger(n) && n > 0 ? `https://github.com/${REGISTRY}/pull/${n}` : null;
}

export function runUrl(id: number | null): string | null {
  return typeof id === "number" && Number.isInteger(id) && id > 0
    ? `https://github.com/${REGISTRY}/actions/runs/${id}`
    : null;
}

export function contractUrl(chainId: unknown, address: unknown): string | null {
  return isChainId(chainId) && isAddress(address) ? `https://repo.sourcify.dev/${chainId}/${address}` : null;
}

export const REPORTS_RAW = `https://raw.githubusercontent.com/${REGISTRY}/test-reports`;

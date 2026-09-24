# Clear-signing test report

A static web page that shows the result of the clear-signing tests of one pull request to the [ERC-7730 registry](https://github.com/ethereum/clear-signing-erc7730-registry). For every test case it draws what the wallet would display, what each implementation rendered, and which cells differ. It also checks the deployments of a descriptor on Sourcify.

Live: https://tests.erc7730.sourcify.dev/

## How a report gets here

1. The registry's `Clear Signing Tests` workflow runs the Sourcify and the Rust implementation against the test file of every affected descriptor.
2. The registry's results workflow merges the artifacts of the run into one `bundle.json` and commits it to the `test-reports` branch of the registry as `pr/<number>/<run id>.json`, next to `pr/<number>/index.json`.
3. This page reads the bundle from `raw.githubusercontent.com` and renders it. It fetches nothing else from the registry.

The bundle format is documented in the registry under `.github/test-runner-docs/bundle.md`. This viewer reads schema version 1 and says so on the page when a bundle is newer.

## URL parameters

| URL | Shows |
| --- | --- |
| `?pr=2984` | The newest run of pull request 2984, with a picker for older runs |
| `?pr=2984&run=34941958423` | One run |
| `?bundle=https://…/bundle.json` | Any bundle by URL (https only) |
| `?sample=2984`, `?sample=2994` | The sample bundles shipped with the site |
| no parameter | The landing page, with a drop zone for a local `bundle.json` |

## Views

- **Header**: pull request, tested commit, run, times, implementations with versions, totals, a "failures only" toggle.
- **Overview**: one row per descriptor with the change kind, functions tested, pass and fail counts per implementation, a marker when implementations disagree, and how many of its deployments have each Sourcify status, e.g. "2 verified" and "3 unverified".
- **Descriptor**: deployments with verification, proxy resolution and "n of m functions in ABI"; every format with its cases, untested ones marked; recommendations.
- **Case card**: the function, chain, contract and signer of the case. The expected screen from the test file on the left. One card per implementation on the right with its status, its screen with the differing cells marked, its message and warnings. A verdict pill in the case title: all pass, implementations disagree, or every implementation differs from the test. A value longer than 120 characters shows only its start and end, with a "show all" control.

## External calls

All read-only, from the browser, after the page has rendered:

- `https://sourcify.dev/server/chains` for chain names.
- `https://sourcify.dev/server/v2/contract/{chainId}/{address}?fields=proxyResolution`, then `?fields=abi` on the implementation or the contract. One field per call.

The page sends at most 6 Sourcify requests at a time. A request that fails, or gets 429 or a 5xx status, is tried once more after 1 to 2 seconds. The same URL is fetched once while it is in flight.

Every string in a bundle comes from a pull request and is treated as text. Links are built only from values that match a strict pattern.

## Run locally

```
npm ci
npm run dev        # http://localhost:5275/clear-signing-test-report/?sample=2984
npm run build      # static site in dist/
npm run preview
```

Deployment: a push to `main` runs `.github/workflows/pages.yml`, which builds the site and deploys it to GitHub Pages. The repository's Pages source must be set to "GitHub Actions".

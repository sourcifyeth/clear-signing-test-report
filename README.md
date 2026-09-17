# Clear-signing test report

A static web page that shows the result of the clear-signing tests of one pull request to the [ERC-7730 registry](https://github.com/ethereum/clear-signing-erc7730-registry). For every test case it draws what the wallet would display, what each implementation rendered, which cells differ, and where each value comes from in the descriptor. It also checks the deployments of a descriptor on Sourcify.

Live: https://tests.erc7730.sourcify.dev/

## How a report gets here

1. The registry's `Clear Signing Tests` workflow runs the Sourcify and the Rust implementation against the test file of every affected descriptor.
2. The registry's results workflow merges the artifacts of the run into one `bundle.json` and commits it to the `test-reports` branch of the registry as `pr/<number>/<run id>.json`, next to `pr/<number>/index.json`.
3. This page reads the bundle from `raw.githubusercontent.com` and renders it. It fetches nothing else from the registry except the test file at the head commit, which it needs to decode the raw arguments.

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
- **Overview**: one row per descriptor with the change kind, functions tested, pass and fail counts per implementation, a marker when implementations disagree, and the Sourcify verification status of the first deployment.
- **Descriptor**: deployments with verification, proxy resolution and "n of m functions in ABI"; every format with its cases, untested ones marked; recommendations.
- **Case card**: the expected screen from the test file on the left, one card per implementation on the right with its status, its screen with the differing cells marked, its message and warnings. A one-line verdict under the cards: all pass, implementations disagree, or every implementation differs from the test.
- **Field provenance**: one row per expected field with the descriptor field (`format`, `params`, `path`), the raw decoded argument with its ABI type, the rendered value, and hints such as an integer shown raw or an address without `addressName`. Hints are notes, never errors.

## External calls

All read-only, from the browser, after the page has rendered:

- `https://sourcify.dev/server/chains` for chain names.
- `https://sourcify.dev/server/v2/contract/{chainId}/{address}?fields=proxyResolution`, then `?fields=abi` on the implementation or the contract. One field per call.
- `https://raw.githubusercontent.com/<head repo>/<head sha>/<test file>` for the raw transactions.

Every string in a bundle comes from a pull request and is treated as text. Links are built only from values that match a strict pattern.

## Run locally

```
npm ci
npm run dev        # http://localhost:5275/clear-signing-test-report/?sample=2984
npm run build      # static site in dist/
npm run preview
```

Deployment: a push to `main` runs `.github/workflows/pages.yml`, which builds the site and deploys it to GitHub Pages. The repository's Pages source must be set to "GitHub Actions".

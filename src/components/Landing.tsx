import { useState, type DragEvent } from "react";
import type { Bundle } from "../lib/bundle";
import { BundleError, SAMPLE_PRS, checkBundle } from "../lib/loadBundle";

interface Props {
  onLocal: (b: Bundle, name: string) => void;
  error: string | null;
}

export function Landing({ onLocal, error }: Props) {
  const [local, setLocal] = useState<string | null>(null);
  const [url, setUrl] = useState("");

  const readFile = (file: File) => {
    file
      .text()
      .then((text) => onLocal(checkBundle(JSON.parse(text)), file.name))
      .catch((e: unknown) => setLocal(e instanceof BundleError || e instanceof Error ? e.message : String(e)));
  };
  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) readFile(file);
  };

  return (
    <main className="landing">
      <h1>Clear-signing test report</h1>
      <p>
        A visual report of the clear-signing tests that run on a pull request to the{" "}
        <a href="https://github.com/ethereum/clear-signing-erc7730-registry">ERC-7730 registry</a>. It shows, for every test case, what the wallet
        would display, what each implementation rendered, where they differ, and where each value comes from in the descriptor.
      </p>
      {error && <div className="callout fail">{error}</div>}
      <h2>Open a report</h2>
      <ul>
        <li>
          From a pull request: <code>?pr=2984</code> for the latest run, or <code>?pr=2984&amp;run=34941958423</code> for one run.
        </li>
        <li>
          From any bundle URL: <code>?bundle=https://…/bundle.json</code>
        </li>
      </ul>
      <h2>Samples</h2>
      <ul>
        {SAMPLE_PRS.map((pr) => (
          <li key={pr}>
            <a href={`?sample=${pr}`}>Pull request {pr}</a>
          </li>
        ))}
      </ul>
      <h2>Local file</h2>
      <div className="drop" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
        Drop a <code>bundle.json</code> here, or{" "}
        <label className="link">
          choose a file
          <input id="local-file" type="file" accept=".json,application/json" hidden onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0])} />
        </label>
        .
        {local && <div className="warn-text small">{local}</div>}
      </div>
      <form
        className="urlform"
        onSubmit={(e) => {
          e.preventDefault();
          if (url) window.location.search = `?bundle=${encodeURIComponent(url)}`;
        }}
      >
        <input id="bundle-url" type="url" placeholder="https://…/bundle.json" value={url} onChange={(e) => setUrl(e.target.value)} />
        <button type="submit">Open</button>
      </form>
      <p className="small muted">
        The bundle format is documented in the registry under <code>.github/test-runner-docs/bundle.md</code>.
      </p>
    </main>
  );
}

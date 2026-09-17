import { useEffect, useState } from "react";
import { DescriptorSection } from "./components/DescriptorSection";
import { Sidebar } from "./components/Sidebar";
import { Header } from "./components/Header";
import { Landing } from "./components/Landing";
import { Overview } from "./components/Overview";
import type { Bundle, RunIndexEntry } from "./lib/bundle";
import { useChains } from "./lib/hooks";
import { load, sourceFromLocation, type Source } from "./lib/loadBundle";

type State =
  | { kind: "landing"; error: string | null }
  | { kind: "loading"; source: Source }
  | { kind: "ready"; bundle: Bundle; index: RunIndexEntry[] | null; currentRun: number | null; name: string | null };

export function App() {
  const [state, setState] = useState<State>({ kind: "landing", error: null });
  const [failuresOnly, setFailuresOnly] = useState(false);
  // The outline is an overlay: closed by default, opened by a hover on its
  // button, and closed when the mouse leaves it.
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const chains = useChains();

  useEffect(() => {
    const source = sourceFromLocation(window.location.search);
    if (source.kind === "none") return;
    setState({ kind: "loading", source });
    load(source).then(
      ({ bundle, index }) => setState({ kind: "ready", bundle, index, currentRun: bundle.run.id, name: null }),
      (e: unknown) => setState({ kind: "landing", error: e instanceof Error ? e.message : String(e) }),
    );
  }, []);

  return (
    <>
      <div className="topbar">
        <div className="topbarInner">
          <a className="brand" href={import.meta.env.BASE_URL}>
            <img src={`${import.meta.env.BASE_URL}sourcify.png`} alt="" />
            <span className="vt">sourcify.dev</span>
            <span className="vt muted">- ERC7730 test report viewer</span>
          </a>
          <nav className="topnav">
            <a href="https://github.com/ethereum/clear-signing-erc7730-registry">registry</a>
            <a href="https://erc7730.sourcify.dev">coverage</a>
            <a href="https://github.com/sourcifyeth/clear-signing-test-report">source</a>
          </nav>
        </div>
      </div>
      {state.kind === "landing" && <Landing error={state.error} onLocal={(bundle, name) => setState({ kind: "ready", bundle, index: null, currentRun: bundle.run.id, name })} />}
      {state.kind === "loading" && <main className="landing muted">Loading the report…</main>}
      {state.kind === "ready" && (
        <div className="report-layout">
          <Sidebar bundle={state.bundle} open={sidebarOpen} onToggle={() => setSidebarOpen((v) => !v)} onOpen={() => setSidebarOpen(true)} onClose={() => setSidebarOpen(false)} />
          <main className="report">
            <Header bundle={state.bundle} index={state.index} currentRun={state.currentRun} failuresOnly={failuresOnly} onFailuresOnly={setFailuresOnly} />
            {state.name && <p className="small muted">Local file {state.name}.</p>}
            <Overview bundle={state.bundle} />
            {state.bundle.descriptors.map((d, i) => (
              <DescriptorSection key={d.path} bundle={state.bundle} d={d} n={i + 1} chains={chains} failuresOnly={failuresOnly} />
            ))}
            {state.bundle.descriptors.length === 0 && <p className="muted">This run tested no descriptor.</p>}
          </main>
        </div>
      )}
    </>
  );
}

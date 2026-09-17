import { useEffect, useState } from "react";
import type { Bundle, DescriptorReport } from "../lib/bundle";
import { verdictOf } from "../lib/classify";
import { anchorOf } from "./DescriptorSection";

interface Props {
  bundle: Bundle;
  open: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onClose: () => void;
}

/** The worst verdict among the cases of a descriptor, for the dot. */
function worstOf(d: DescriptorReport, implIds: string[]): "fail" | "warn" | "pass" | "none" {
  let worst: "fail" | "warn" | "pass" | "none" = "none";
  for (const c of d.cases ?? []) {
    const v = verdictOf(c, implIds);
    if (v === "all-differ") return "fail";
    if (v === "disagree" || v === "error") worst = "warn";
    else if (v === "pass" && worst === "none") worst = "pass";
  }
  return worst;
}

/** The id of the section that is closest to the top of the viewport. */
function useActiveSection(ids: string[]): string | null {
  const [active, setActive] = useState<string | null>(ids[0] ?? null);
  useEffect(() => {
    const els = ids.map((id) => document.getElementById(id)).filter((e): e is HTMLElement => e !== null);
    if (els.length === 0) return;
    const pick = () => {
      // The top bar and the sticky heads take about 110px; the section whose
      // top is last above that line is the one the reader is in.
      const line = 120;
      let current = els[0].id;
      for (const el of els) {
        if (el.getBoundingClientRect().top <= line) current = el.id;
      }
      setActive(current);
    };
    pick();
    window.addEventListener("scroll", pick, { passive: true });
    window.addEventListener("resize", pick);
    return () => {
      window.removeEventListener("scroll", pick);
      window.removeEventListener("resize", pick);
    };
  }, [ids.join("|")]);
  return active;
}

export function Sidebar({ bundle, open, onToggle, onOpen, onClose }: Props) {
  const implIds = bundle.implementations.map((i) => i.id);
  const ids = ["overview", ...bundle.descriptors.map(anchorOf)];
  const active = useActiveSection(ids);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    // One wrapper for the button and the panel, so that a move from the panel
    // to the button does not count as leaving.
    <div className="sidebar-wrap" onMouseLeave={open ? onClose : undefined}>
      <button type="button" className={`sidebar-toggle ${open ? "is-open" : ""}`} onClick={onToggle} onMouseEnter={onOpen} aria-expanded={open} aria-controls="report-sidebar" title={open ? "Hide the outline" : "Show the outline"}>
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <path fill="currentColor" d="M1 3.5A.5.5 0 0 1 1.5 3h13a.5.5 0 0 1 0 1h-13a.5.5 0 0 1-.5-.5Zm0 4A.5.5 0 0 1 1.5 7h13a.5.5 0 0 1 0 1h-13a.5.5 0 0 1-.5-.5Zm0 4a.5.5 0 0 1 .5-.5h13a.5.5 0 0 1 0 1h-13a.5.5 0 0 1-.5-.5Z" />
        </svg>
        <span>outline</span>
      </button>
      <aside id="report-sidebar" className={`sidebar ${open ? "" : "is-hidden"}`} aria-label="Outline of the report">
        <div className="sidebar-title">Outline</div>
        <nav>
          <a href="#overview" className={`sidebar-link ${active === "overview" ? "is-active" : ""}`} onClick={onClose}>
            Overview
          </a>
          <div className="sidebar-title sub">Descriptor files</div>
          {bundle.descriptors.map((d, i) => {
            const id = anchorOf(d);
            return (
              <a key={d.path} href={`#${id}`} className={`sidebar-link ${active === id ? "is-active" : ""}`} title={d.path} onClick={onClose}>
                <span className={`sig ${worstOf(d, implIds)}`} />
                <span className="sidebar-n">{i + 1}</span>
                <span className="sidebar-name">{d.name}</span>
              </a>
            );
          })}
          {bundle.descriptors.length === 0 && <span className="muted small">none</span>}
        </nav>
      </aside>
    </div>
  );
}

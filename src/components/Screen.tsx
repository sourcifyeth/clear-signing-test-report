import { useState } from "react";
import { isRendered, type Rendered } from "../lib/bundle";
import { render } from "../lib/decode";

interface Props {
  rendered: Rendered | null;
  /** Diff paths of this output, e.g. "fields[3].value". Cells on these paths are marked. */
  diffPaths?: Set<string>;
  prefix?: string;
  depth?: number;
}

const at = (prefix: string, key: string) => (prefix === "" ? key : `${prefix}.${key}`);

/*
 * A value can be very long, e.g. the raw calldata of a nested call (some KB
 * of hex). Such a value is shown as its start and end, with a control that
 * shows all of it, so that one field does not fill the screen.
 */
const LONG = 120;
const HEAD = 42;
const TAIL = 16;

function Value({ text }: { text: string }) {
  const [all, setAll] = useState(false);
  if (text.length <= LONG) return <>{text}</>;
  return (
    <>
      <span title={all ? undefined : text}>{all ? text : `${text.slice(0, HEAD)}…${text.slice(-TAIL)}`}</span>{" "}
      <button type="button" className="linklike value-toggle" onClick={() => setAll((v) => !v)} aria-expanded={all}>
        {all ? "show less" : `show all (${text.length} characters)`}
      </button>
    </>
  );
}

/** One rendered output drawn like a wallet screen. */
export function Screen({ rendered, diffPaths, prefix = "", depth = 0 }: Props) {
  if (!rendered || typeof rendered !== "object") {
    return <div className="screen screen-empty">No rendered output.</div>;
  }
  const marked = (p: string) => (diffPaths?.has(p) ? " diff" : "");
  const fields = Array.isArray(rendered.fields) ? rendered.fields : [];
  const intent = rendered.interpolatedIntent ?? rendered.intent;
  return (
    <div className={`screen${depth > 0 ? " nested" : ""}`}>
      <div className={`intent${marked(at(prefix, "intent"))}${marked(at(prefix, "interpolatedIntent"))}`}>
        {typeof intent === "string" && intent !== "" ? intent : <span className="muted">(no intent)</span>}
      </div>
      {/* The owner is metadata, not something the reviewer judges. It is shown only when it differs from the expected output. */}
      {rendered.owner !== undefined && marked(at(prefix, "owner")) !== "" && (
        <div className="owner diff">owner: {typeof rendered.owner === "string" ? rendered.owner : render(rendered.owner)}</div>
      )}
      {rendered.interpolatedIntent !== undefined && rendered.intent !== undefined && rendered.interpolatedIntent !== rendered.intent && (
        <div className="intent-literal">intent: {render(rendered.intent)}</div>
      )}
      <div className="fields">
        {fields.length === 0 && <div className="field muted">no field</div>}
        {fields.map((f, i) => {
          const p = at(prefix, `fields[${i}]`);
          const whole = marked(p) || marked(at(prefix, "fields.length")) ? " diff" : "";
          if (isRendered(f.value)) {
            return (
              <div key={i} className={`field field-nested${whole}`}>
                <div className={`label${marked(`${p}.label`)}`}>{render(f.label)}</div>
                <Screen rendered={f.value} diffPaths={diffPaths} prefix={`${p}.value`} depth={depth + 1} />
              </div>
            );
          }
          return (
            <div key={i} className={`field${whole}`}>
              <span className={`label${marked(`${p}.label`)}`}>{render(f.label)}</span>
              <span className={`value mono${marked(`${p}.value`)}`}>
                <Value text={render(f.value)} />
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

import { useState } from "react";
import { isRendered, type Rendered } from "../lib/bundle";
import { render } from "../lib/decode";

interface Props {
  rendered: Rendered | null;
  /** Diff paths of this output, e.g. "fields[3].value". Cells on these paths are marked. */
  diffPaths?: Set<string>;
  prefix?: string;
  depth?: number;
  /** The interpolatedIntent template of the format, e.g. "List PUT {tokenId}". It marks the filled values. */
  template?: string | null;
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

/**
 * Splits an interpolated intent into the template's own text and the values
 * the wallet filled in for its "{path}" placeholders. Null when the text does
 * not follow the template, e.g. a runner rendered it differently. The template
 * comes from a pull request, so it is escaped and bounded before it becomes a
 * pattern.
 */
function filledParts(text: string, template: string | null | undefined): { text: string; param: string | null }[] | null {
  if (typeof template !== "string" || text.length > 1000) return null;
  const literals = template.split(/\{[^{}]*\}/);
  const params = [...template.matchAll(/\{([^{}]*)\}/g)].map((p) => p[1].trim());
  if (literals.length < 2 || literals.length > 12) return null;
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = new RegExp(`^${literals.map(esc).join("([\\s\\S]+?)")}$`).exec(text);
  if (!m) return null;
  const out: { text: string; param: string | null }[] = [];
  literals.forEach((lit, i) => {
    if (lit !== "") out.push({ text: lit, param: null });
    if (i < literals.length - 1) out.push({ text: m[i + 1], param: params[i] ?? "" });
  });
  return out;
}

/** One rendered output drawn like a wallet screen. */
export function Screen({ rendered, diffPaths, prefix = "", depth = 0, template }: Props) {
  if (!rendered || typeof rendered !== "object") {
    return <div className="screen screen-empty">No rendered output.</div>;
  }
  const marked = (p: string) => (diffPaths?.has(p) ? " diff" : "");
  const fields = Array.isArray(rendered.fields) ? rendered.fields : [];
  const intent = rendered.intent;
  const interpolated = rendered.interpolatedIntent;
  return (
    <div className={`screen${depth > 0 ? " nested" : ""}`}>
      <div className={`intent${marked(at(prefix, "intent"))}`}>
        <span className="intent-label">Intent:</span>{" "}
        {typeof intent === "string" && intent !== "" ? intent : <span className="muted">(no intent)</span>}
      </div>
      {/* The owner is metadata, not something the reviewer judges. It is shown only when it differs from the expected output. */}
      {rendered.owner !== undefined && marked(at(prefix, "owner")) !== "" && (
        <div className="owner diff">owner: {typeof rendered.owner === "string" ? rendered.owner : render(rendered.owner)}</div>
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
      {/* The sentence a wallet can show in place of the intent, with the values filled in. Below the fields, because it repeats them. */}
      {interpolated !== undefined && interpolated !== intent && (
        <div className={`interpolated${marked(at(prefix, "interpolatedIntent"))}`}>
          <div className="intent-label">Interpolated intent</div>
          {(() => {
            const text = render(interpolated);
            const parts = depth === 0 ? filledParts(text, template) : null;
            if (!parts) return text;
            return parts.map((part, i) =>
              part.param === null ? (
                part.text
              ) : (
                <span key={i} className="filled" tabIndex={0}>
                  {part.text}
                  {/* Hidden until hover or focus, and left out of the copied text. */}
                  <span className="param-tip" role="tooltip">
                    Filled from <code>{`{${part.param}}`}</code>
                  </span>
                </span>
              ),
            );
          })()}
        </div>
      )}
    </div>
  );
}

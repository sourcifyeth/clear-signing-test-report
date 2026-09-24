import { formatName, recommendationText, type Bundle, type Recommendation } from "../lib/bundle";
import { fileAtSha } from "../lib/links";

/** The name of a file, linked to the file at the head commit when the path is safe. */
export function FileName({ bundle, file, full = false }: { bundle: Bundle; file: string; full?: boolean }) {
  const link = fileAtSha(bundle.pr.headRepo, bundle.pr.headSha, file);
  const text = full ? file : file.split("/").pop();
  return link ? (
    <a className="mono" href={link} target="_blank" rel="noreferrer" title={file}>
      {text}
    </a>
  ) : (
    <span className="mono" title={file}>
      {text}
    </span>
  );
}

/**
 * The suggestions on files that no descriptor section shows: shared files
 * that descriptors include, and descriptors without a test file. The
 * suggestions on a descriptor's own file are in its section.
 */
export function suggestionsByFile(bundle: Bundle): [string, Recommendation[]][] {
  const own = new Set(bundle.descriptors.map((d) => d.path));
  const byFile = new Map<string, Recommendation[]>();
  for (const r of bundle.recommendations ?? []) {
    if (!r.file || own.has(r.file)) continue;
    byFile.set(r.file, [...(byFile.get(r.file) ?? []), r]);
  }
  return [...byFile.entries()];
}

export function Suggestions({ bundle }: { bundle: Bundle }) {
  const files = suggestionsByFile(bundle);
  if (files.length === 0) return null;
  return (
    <section className="suggestions" id="suggestions">
      <h2>Suggestions for other files</h2>
      <p className="small muted">Shared files that descriptors include, and descriptors without a test file.</p>
      {files.map(([file, recs]) => (
        <div key={file} className="suggestions-file">
          <div className="col-title">
            <FileName bundle={bundle} file={file} full />
          </div>
          <ul className="formats small">
            {recs.map((r, i) => (
              <li key={i} title={r.pointer}>
                {(r.format ?? r.key) && (
                  <>
                    <span className="mono" title={r.format ?? r.key}>
                      {r.format ? formatName(r.format) : r.key}
                    </span>{" "}
                  </>
                )}
                <span className="muted">{r.message ?? recommendationText(r)}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

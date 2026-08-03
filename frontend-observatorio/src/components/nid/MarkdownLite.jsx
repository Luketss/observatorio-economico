// frontend-observatorio/src/components/nid/MarkdownLite.jsx
import { parseMarkdownLite } from "../../utils/markdownLite";

function Inline({ segs }) {
  return segs.map((s, i) =>
    s.negrito
      ? <strong key={i} style={{ color: "var(--text)", fontWeight: 600 }}>{s.texto}</strong>
      : <span key={i}>{s.texto}</span>
  );
}

/** Render dos blocos do markdown leve na escala nid. Zero dangerouslySetInnerHTML. */
export default function MarkdownLite({ texto }) {
  const blocos = parseMarkdownLite(texto);
  if (blocos.length === 0) return null;
  return (
    <div style={{ fontSize: 13, color: "var(--text-dim)", lineHeight: 1.6, display: "grid", gap: 10 }}>
      {blocos.map((b, i) => {
        if (b.tipo === "h2") {
          return (
            <h3 key={i} style={{ font: "700 14px/1.3 var(--font-display)", color: "var(--text)", margin: "6px 0 0" }}>
              <Inline segs={b.inline} />
            </h3>
          );
        }
        if (b.tipo === "h3") {
          return (
            <h4 key={i} style={{ font: "700 13.5px/1.3 var(--font-display)", color: "var(--text)", margin: "4px 0 0" }}>
              <Inline segs={b.inline} />
            </h4>
          );
        }
        if (b.tipo === "lista") {
          return (
            <ul key={i} style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 4, listStyle: "disc" }}>
              {b.itens.map((item, j) => <li key={j}><Inline segs={item} /></li>)}
            </ul>
          );
        }
        return (
          <p key={i} style={{ margin: 0 }}>
            {b.linhas.map((l, j) => (
              <span key={j}>{j > 0 && <br />}<Inline segs={l} /></span>
            ))}
          </p>
        );
      })}
    </div>
  );
}

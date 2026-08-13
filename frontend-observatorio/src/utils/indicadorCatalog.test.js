import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { INDICADOR_CATALOG, todasAsChaves } from "./indicadorCatalog";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("invariantes do catálogo", () => {
  it("chaves únicas por dataset", () => {
    for (const [dataset, entries] of Object.entries(INDICADOR_CATALOG)) {
      const keys = entries.map((e) => e.key);
      expect(new Set(keys).size, `duplicata em ${dataset}`).toBe(keys.length);
    }
  });

  it("tipo chart usa prefixo chart_; kpi não usa", () => {
    for (const [dataset, entries] of Object.entries(INDICADOR_CATALOG)) {
      for (const e of entries) {
        if (e.tipo === "chart") {
          expect(e.key, `${dataset}.${e.key}`).toMatch(/^chart_[a-z0-9_]+$/);
        } else {
          expect(e.tipo).toBe("kpi");
          expect(e.key).not.toMatch(/^chart_/);
        }
      }
    }
  });

  it("labels não vazios", () => {
    for (const entries of Object.values(INDICADOR_CATALOG)) {
      for (const e of entries) expect(e.label.trim().length).toBeGreaterThan(0);
    }
  });
});

// ── Paridade fonte → catálogo ────────────────────────────────────────────────
// Toda chave literal usada no JSX (indicadorKey="x" ou indicadorKey: "x")
// precisa existir no catálogo — pega typo e chave fantasma na plugagem.

function chavesLiteraisNoFonte() {
  const dirs = [path.resolve(__dirname, "../pages"), path.resolve(__dirname, "../components")];
  const chaves = new Set();
  const re = /indicadorKey(?:=|:)\s*"([^"]+)"/g;
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.name.endsWith(".jsx")) {
        const src = fs.readFileSync(p, "utf8");
        for (const m of src.matchAll(re)) chaves.add(m[1]);
      }
    }
  };
  dirs.forEach(walk);
  // Docstrings de exemplo (ChartInfoIcon: chart_saldo; KpiCard: ultimo_ano) também
  // são capturadas — ambas existem no catálogo, então não geram falso positivo.
  return chaves;
}

describe("paridade fonte → catálogo", () => {
  it("toda chave literal do JSX existe no catálogo", () => {
    const catalogo = todasAsChaves();
    const faltando = [...chavesLiteraisNoFonte()].filter((k) => !catalogo.has(k));
    expect(faltando, `chaves usadas no JSX sem entrada no catálogo: ${faltando.join(", ")}`).toEqual([]);
  });
});

// ── Paridade inversa: catálogo → fonte ───────────────────────────────────────
// Toda entrada do catálogo deve estar plugada em alguma página — pega painel
// esquecido. Exceções: chaves usadas dinamicamente (indicadorKey={d.key}).
const USADAS_DINAMICAMENTE = new Set([
  // IpsPage.jsx:302 — dimensões mapeadas de DIMENSIONS com indicadorKey={d.key}
  "necessidades_humanas_basicas",
  "fundamentos_bem_estar",
  "oportunidades",
]);

describe("paridade catálogo → fonte", () => {
  it("toda entrada do catálogo é usada literalmente no JSX (ou é dinâmica declarada)", () => {
    const usadas = chavesLiteraisNoFonte();
    const naoUsadas = [];
    for (const [dataset, entries] of Object.entries(INDICADOR_CATALOG)) {
      for (const e of entries) {
        if (!usadas.has(e.key) && !USADAS_DINAMICAMENTE.has(e.key)) {
          naoUsadas.push(`${dataset}.${e.key}`);
        }
      }
    }
    expect(naoUsadas, `entradas do catálogo sem uso no JSX: ${naoUsadas.join(", ")}`).toEqual([]);
  });
});

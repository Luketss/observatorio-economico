/**
 * Gera dataset PIB - Multicidades
 * Fonte: PIB_Cidades_Completo
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pastaPib = path.resolve(__dirname, "../../PIB_Cidades_Completo");

const outputPath = path.resolve(__dirname, "../src/data/pib.json");

function normalizarNomeCidade(nomeArquivo) {
  return nomeArquivo
    .replace("pib_", "")
    .replace(".csv", "")
    .replace(/_/g, " ")
    .toUpperCase();
}

function gerar() {
  const arquivos = fs.readdirSync(pastaPib);

  const resultadoFinal = {};

  arquivos.forEach((arquivo) => {
    if (!arquivo.endsWith(".csv")) return;

    const cidade = normalizarNomeCidade(arquivo);
    const caminho = path.join(pastaPib, arquivo);

    const raw = fs.readFileSync(caminho, "utf-8");
    const linhas = raw.split("\n").slice(1);

    const serie = [];

    for (const linha of linhas) {
      if (!linha.trim()) continue;

      const cols = linha.split(";");

      const ano = Number(cols[0]);
      // Coluna correta do PIB_Total é índice 4
      const pib = cols[4] ? Number(cols[4]) : null;

      if (!ano) continue;

      serie.push({
        ano,
        pib,
      });
    }

    serie.sort((a, b) => a.ano - b.ano);

    resultadoFinal[cidade] = serie;
  });

  fs.writeFileSync(outputPath, JSON.stringify(resultadoFinal, null, 2));

  console.log("✅ PIB Multicidades gerado:", outputPath);
}

gerar();

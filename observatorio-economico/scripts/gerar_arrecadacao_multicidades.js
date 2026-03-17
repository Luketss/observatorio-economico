/**
 * Gera dataset Arrecadação - Multicidades
 * Fonte: Arrecadacao_Cidades_MG
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pastaArrecadacao = path.resolve(
  __dirname,
  "../../Arrecadacao_Cidades_MG",
);

const outputPath = path.resolve(
  __dirname,
  "../src/data/arrecadacao_multicidades.json",
);

function normalizarNomeCidade(nomeArquivo) {
  return nomeArquivo
    .replace("arrecadacao_", "")
    .replace(".csv", "")
    .replace(/_/g, " ")
    .toUpperCase();
}

function gerar() {
  const arquivos = fs.readdirSync(pastaArrecadacao);

  const resultadoFinal = {};

  arquivos.forEach((arquivo) => {
    if (!arquivo.endsWith(".csv")) return;

    const cidade = normalizarNomeCidade(arquivo);
    const caminho = path.join(pastaArrecadacao, arquivo);

    const raw = fs.readFileSync(caminho, "utf-8");
    const linhas = raw.split("\n").slice(1);

    const serie = [];

    for (const linha of linhas) {
      if (!linha.trim()) continue;

      const cols = linha.split(";");

      // Estrutura real do CSV:
      // 0 = ano_particao
      // 1 = MES_ESTIMADO
      // 2 = NOME_MES
      // 3 = vr_icms
      // 4 = vr_ipva
      // 5 = vr_ipi
      // 6 = DATA_BASE

      const ano = Number(cols[0]);
      const mes = Number(cols[1]);

      const icms = Number(cols[3] || 0);
      const ipva = Number(cols[4] || 0);
      const ipi = Number(cols[5] || 0);

      const total = icms + ipva + ipi;

      if (!ano || !mes) continue;

      serie.push({
        ano,
        mes,
        total,
        icms,
        ipva,
        ipi,
      });
    }

    serie.sort((a, b) => (a.ano === b.ano ? a.mes - b.mes : a.ano - b.ano));

    resultadoFinal[cidade] = serie;
  });

  fs.writeFileSync(outputPath, JSON.stringify(resultadoFinal, null, 2));

  console.log("✅ Arrecadação Multicidades gerado:", outputPath);
}

gerar();

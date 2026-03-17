/**
 * Gera dataset Arrecadação - Oliveira
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
  "../src/data/arrecadacao_oliveira.json",
);

function gerar() {
  const arquivos = fs.readdirSync(pastaArrecadacao);
  const arquivoOliveira = arquivos.find((a) =>
    a.toLowerCase().includes("oliveira"),
  );

  if (!arquivoOliveira) {
    console.error("Arquivo Arrecadação de Oliveira não encontrado.");
    return;
  }

  const caminho = path.join(pastaArrecadacao, arquivoOliveira);
  const raw = fs.readFileSync(caminho, "utf-8");
  const linhas = raw.split("\n").slice(1);

  const resultado = [];

  for (const linha of linhas) {
    if (!linha.trim()) continue;

    const cols = linha.split(";");

    const ano = Number(cols[0]);
    const mes = Number(cols[1]);
    const total = Number((cols[2] || "0").replace(",", "."));

    if (!ano || !mes) continue;

    resultado.push({
      ano,
      mes,
      total,
    });
  }

  resultado.sort((a, b) => (a.ano === b.ano ? a.mes - b.mes : a.ano - b.ano));

  fs.writeFileSync(outputPath, JSON.stringify(resultado, null, 2));

  console.log("✅ Arrecadação Oliveira gerado:", outputPath);
}

gerar();

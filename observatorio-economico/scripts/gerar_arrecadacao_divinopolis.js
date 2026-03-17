/**
 * Gera dataset agregado Arrecadação - Divinópolis
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
  "../src/data/arrecadacao_divinopolis.json",
);

function gerar() {
  const arquivos = fs.readdirSync(pastaArrecadacao);
  const arquivoDiv = arquivos.find((a) =>
    a.toLowerCase().includes("divinopolis"),
  );

  if (!arquivoDiv) {
    console.error("Arquivo de arrecadação de Divinópolis não encontrado.");
    return;
  }

  const caminho = path.join(pastaArrecadacao, arquivoDiv);
  const raw = fs.readFileSync(caminho, "utf-8");
  const linhas = raw.split("\n").slice(1);

  const agregados = {};

  for (const linha of linhas) {
    if (!linha.trim()) continue;

    const cols = linha.split(";");

    // Ajustar conforme estrutura real do CSV
    const ano = Number(cols[0]);
    const mes = Number(cols[1]);
    const valor = Number((cols[2] || "0").replace(",", "."));

    if (!ano || !mes) continue;

    const chave = `${ano}-${mes}`;

    if (!agregados[chave]) {
      agregados[chave] = {
        ano,
        mes,
        total: 0,
      };
    }

    agregados[chave].total += valor || 0;
  }

  const resultado = Object.values(agregados).sort(
    (a, b) => a.ano - b.ano || a.mes - b.mes,
  );

  fs.writeFileSync(outputPath, JSON.stringify(resultado, null, 2));

  console.log("✅ Arrecadação Divinópolis gerado:", outputPath);
}

gerar();

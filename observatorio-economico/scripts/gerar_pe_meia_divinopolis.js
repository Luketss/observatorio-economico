/**
 * Gera dataset agregado Pe de Meia - Divinópolis
 * Fonte: Pe_De_Meia_Cidades_Completo
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pastaPeMeia = path.resolve(
  __dirname,
  "../../Pe_De_Meia_Cidades_Completo",
);

const outputPath = path.resolve(
  __dirname,
  "../src/data/pe_meia_divinopolis.json",
);

function gerar() {
  const arquivos = fs.readdirSync(pastaPeMeia);
  const arquivoDiv = arquivos.find((a) =>
    a.toLowerCase().includes("divinopolis"),
  );

  if (!arquivoDiv) {
    console.error("Arquivo Pe de Meia de Divinópolis não encontrado.");
    return;
  }

  const caminho = path.join(pastaPeMeia, arquivoDiv);
  const raw = fs.readFileSync(caminho, "utf-8");
  const linhas = raw.split("\n").slice(1);

  const agregados = {};

  for (const linha of linhas) {
    if (!linha.trim()) continue;

    const cols = linha.split(";");
    const ano = Number(cols[0]); // assumindo ano na primeira coluna
    const beneficiarios = Number(cols[1]); // assumindo total beneficiários

    if (!ano || !beneficiarios) continue;

    if (!agregados[ano]) {
      agregados[ano] = {
        ano,
        total_beneficiarios: 0,
      };
    }

    agregados[ano].total_beneficiarios += beneficiarios;
  }

  const resultado = Object.values(agregados).sort((a, b) => a.ano - b.ano);

  fs.writeFileSync(outputPath, JSON.stringify(resultado, null, 2));

  console.log("✅ Pe de Meia Divinópolis gerado:", outputPath);
}

gerar();

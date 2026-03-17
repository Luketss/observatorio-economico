/**
 * Gera dataset Pé de Meia - Oliveira
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

const outputPath = path.resolve(__dirname, "../src/data/pe_meia_oliveira.json");

function gerar() {
  const arquivos = fs.readdirSync(pastaPeMeia);
  const arquivoOliveira = arquivos.find((a) =>
    a.toLowerCase().includes("oliveira"),
  );

  if (!arquivoOliveira) {
    console.error("Arquivo Pé de Meia de Oliveira não encontrado.");
    return;
  }

  const caminho = path.join(pastaPeMeia, arquivoOliveira);
  const raw = fs.readFileSync(caminho, "utf-8");
  const linhas = raw.split("\n").slice(1);

  const resultado = [];

  for (const linha of linhas) {
    if (!linha.trim()) continue;

    const cols = linha.split(";");

    const anoMes = Number(cols[0]); // formato YYYYMM
    const total = Number(cols[1]);

    if (!anoMes) continue;

    resultado.push({
      ano: anoMes,
      total_beneficiarios: total,
    });
  }

  resultado.sort((a, b) => a.ano - b.ano);

  fs.writeFileSync(outputPath, JSON.stringify(resultado, null, 2));

  console.log("✅ Pé de Meia Oliveira gerado:", outputPath);
}

gerar();

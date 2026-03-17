/**
 * Gera dataset agregado Bolsa Família - Oliveira
 * Fonte: Bolsa_Familia_Cidades_Completo
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pastaBolsa = path.resolve(
  __dirname,
  "../../Bolsa_Familia_Cidades_Completo",
);

const outputPath = path.resolve(
  __dirname,
  "../src/data/bolsa_familia_oliveira.json",
);

function gerar() {
  const arquivos = fs.readdirSync(pastaBolsa);
  const arquivoOliveira = arquivos.find((a) =>
    a.toLowerCase().includes("oliveira"),
  );

  if (!arquivoOliveira) {
    console.error("Arquivo Bolsa Família de Oliveira não encontrado.");
    return;
  }

  const caminho = path.join(pastaBolsa, arquivoOliveira);
  const raw = fs.readFileSync(caminho, "utf-8");
  const linhas = raw.split("\n").slice(1);

  const agregados = {};

  for (const linha of linhas) {
    if (!linha.trim()) continue;

    const cols = linha.split(";");

    // CSV real:
    // 0 = MÊS COMPETÊNCIA (YYYYMM)
    // 1 = Data
    // 2 = Município
    // 3 = NIS
    // 4 = Valor Parcela
    // 5 = Primeira Infância
    // 6 = Valor Bolsa

    const competencia = cols[0];
    if (!competencia) continue;

    const ano = Number(competencia.slice(0, 4));
    const valorBolsa = Number((cols[6] || "0").replace(",", "."));

    if (!ano) continue;

    if (!agregados[ano]) {
      agregados[ano] = {
        ano,
        total_beneficiarios: 0,
        total_repasses: 0,
      };
    }

    // Cada linha representa 1 beneficiário
    agregados[ano].total_beneficiarios += 1;

    if (!isNaN(valorBolsa)) {
      agregados[ano].total_repasses += valorBolsa;
    }
  }

  const resultado = Object.values(agregados).sort((a, b) => a.ano - b.ano);

  fs.writeFileSync(outputPath, JSON.stringify(resultado, null, 2));

  console.log("✅ Bolsa Família Oliveira gerado:", outputPath);
}

gerar();
